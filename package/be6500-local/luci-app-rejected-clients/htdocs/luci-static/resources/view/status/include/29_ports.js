'use strict';
'require baseclass';
'require uci';
'require rpc';
'require network';
'require firewall';

var callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] }
});

var callGetSwconfigPortState = rpc.declare({
	object: 'luci',
	method: 'getSwconfigPortState',
	params: [ 'switch' ],
	expect: { result: [] }
});

function speedText(link, speed, duplex) {
	if (!link)
		return _('未连接');

	var text = speed > 0
		? (speed >= 1000 ? '%s GbE'.format(speed / 1000) : '%s Mbps'.format(speed))
		: _('已连接');

	return duplex ? text + ' · ' + _('全双工') : text;
}

function byteText(bytes) {
	bytes = +bytes || 0;

	if (bytes >= 1073741824)
		return '%.2f GiB'.format(bytes / 1073741824);
	if (bytes >= 1048576)
		return '%.2f MiB'.format(bytes / 1048576);
	if (bytes >= 1024)
		return '%.2f KiB'.format(bytes / 1024);

	return '%d B'.format(bytes);
}

function splitWords(value) {
	var words = [];

	L.toArray(value).forEach(function(item) {
		String(item || '').trim().split(/\s+/).forEach(function(word) {
			if (word)
				words.push(word);
		});
	});

	return words;
}

function addUnique(list, item, key) {
	for (var i = 0; i < list.length; i++)
		if (key(list[i]) == key(item))
			return;

	list.push(item);
}

/* Expand the UCI network model down to the four physical sockets.  The WAN
 * MAC is eth0.  The three LAN sockets sit behind switch1, whose CPU port is
 * eth1/port 0.  Tagged eth1.<vid> devices therefore resolve through the
 * matching switch_vlan section, while raw eth1 follows an untagged CPU VLAN. */
function buildPortMapping(zones, networks) {
	var interfaces = {};
	var devices = {};
	var switchVlans = {};
	var portMap = {};
	var zoneByNetwork = {};

	uci.sections('network', 'interface').forEach(function(section) {
		interfaces[section['.name']] = section;
	});

	uci.sections('network', 'device').forEach(function(section) {
		if (!section.name)
			return;

		if (section.type == 'bridge')
			devices[section.name] = splitWords(section.ports);
		else if ((section.type == '8021q' || section.type == '8021ad') && section.ifname)
			devices[section.name] = [ section.ifname ];
	});

	uci.sections('network', 'switch_vlan').forEach(function(section) {
		if (section.device != 'switch1')
			return;

		var vid = String(section.vid || section.vlan || '');
		var entry = switchVlans[vid] || (switchVlans[vid] = {
			ports: [],
			cpuTagged: false,
			cpuUntagged: false
		});

		splitWords(section.ports).forEach(function(token) {
			var match = token.match(/^(\d+)([ut*]*)$/);
			if (!match)
				return;

			if (+match[1] == 0) {
				if (match[2].indexOf('t') >= 0)
					entry.cpuTagged = true;
				else
					entry.cpuUntagged = true;
			}
			else if (+match[1] >= 1 && +match[1] <= 3 && entry.ports.indexOf(+match[1]) < 0) {
				entry.ports.push(+match[1]);
			}
		});
	});

	zones.forEach(function(zone) {
		zone.getNetworks().forEach(function(networkName) {
			zoneByNetwork[networkName] = zone;
		});
	});

	function resolveInterface(networkName, seen) {
		var section = interfaces[networkName];
		if (!section || seen['interface:' + networkName])
			return [];

		seen['interface:' + networkName] = true;
		var sources = splitWords(section.device).concat(splitWords(section.ifname));
		var result = [];

		sources.forEach(function(source) {
			result = result.concat(resolveDevice(source, seen));
		});

		return result;
	}

	function resolveDevice(device, seen) {
		if (!device)
			return [];

		if (device.charAt(0) == '@')
			return resolveInterface(device.substring(1), seen);

		if (seen[device])
			return [];

		seen[device] = true;

		if (devices[device]) {
			var expanded = [];
			devices[device].forEach(function(member) {
				expanded = expanded.concat(resolveDevice(member, seen));
			});
			return expanded;
		}

		var vlan = device.match(/^eth1\.(\d+)$/);
		if (vlan && switchVlans[vlan[1]])
			return switchVlans[vlan[1]].ports.map(function(port) { return 'switch1:' + port; });

		if (device == 'eth1') {
			var lanPorts = [];
			Object.keys(switchVlans).forEach(function(vid) {
				if (!switchVlans[vid].cpuUntagged)
					return;
				switchVlans[vid].ports.forEach(function(port) {
					if (lanPorts.indexOf(port) < 0)
						lanPorts.push(port);
				});
			});
			return (lanPorts.length ? lanPorts : [ 1, 2, 3 ]).map(function(port) {
				return 'switch1:' + port;
			});
		}

		if (/^eth0(?:\.\d+)?$/.test(device))
			return [ 'eth0' ];

		return [ device ];
	}

	networks.forEach(function(network) {
		var networkName = network.getName();
		var endpoints = resolveInterface(networkName, {});

		if (!endpoints.length && network.getDevice())
			endpoints = resolveDevice(network.getDevice().getName(), {});

		endpoints.forEach(function(endpoint) {
			var mapping = portMap[endpoint] || (portMap[endpoint] = {
				networks: [],
				zones: [],
				zoneByNetwork: {}
			});
			var zone = zoneByNetwork[networkName];

			addUnique(mapping.networks, network, function(item) { return item.getName(); });
			if (zone) {
				addUnique(mapping.zones, zone, function(item) { return item.getName(); });
				mapping.zoneByNetwork[networkName] = zone;
			}
		});
	});

	return portMap;
}

function renderNetworkBadge(network, zone) {
	var l3dev = network.getDevice();
	var zoneName = zone ? zone.getName() : null;
	var badge = E('span', { 'class': 'ifacebadge', 'style': 'margin:.125em 0' }, [
		E('span', {
			'class': 'zonebadge',
			'title': zoneName ? _('属于防火墙区域“%s”').format(zoneName) : _('未分配防火墙区域'),
			'style': firewall.getZoneColorStyle(zone)
		}, [ '\u202f' ]),
		'\u202f', network.getName(), ': '
	]);

	if (l3dev) {
		badge.appendChild(E('img', {
			'title': l3dev.getI18n(),
			'src': L.resource('icons/%s%s.svg').format(l3dev.getType(), l3dev.isUp() ? '' : '_disabled')
		}));
	}
	else {
		badge.appendChild(E('em', {}, [ _('（未连接接口）') ]));
	}

	return badge;
}

function renderNetworksTooltip(mapping) {
	if (!mapping || !mapping.networks.length)
		return E('span', {}, [ _('该端口不属于任何网络') ]);

	var content = [ _('网络的一部分：') ];
	mapping.networks.forEach(function(network) {
		content.push(E('br'), renderNetworkBadge(network, mapping.zoneByNetwork[network.getName()]));
	});

	return E('span', {}, content);
}

function portCard(name, link, speed, duplex, mapping, rxBytes, txBytes) {
	/* The color bar represents firewall zones, like LuCI's native port view.
	 * An IPv4/IPv6 interface pair (for example wan + wan6) belongs to the same
	 * zone and must not make that zone wider than a second VLAN/zone. */
	var members = [];
	var memberKeys = {};
	(mapping && mapping.networks.length ? mapping.networks : [ null ]).forEach(function(network) {
		var zone = network && mapping ? mapping.zoneByNetwork[network.getName()] : null;
		var key = zone ? 'zone:' + zone.getName() : 'network:' + (network ? network.getName() : 'none');
		if (!memberKeys[key]) {
			memberKeys[key] = true;
			members.push({ network: network, zone: zone, key: key });
		}
	});
	members.sort(function(a, b) {
		return L.naturalCompare(a.key, b.key);
	});

	var segments = members.map(function(member, index) {
		return E('div', {
			'class': 'be6500-port-zone-segment',
			'style': 'cursor:help;flex:0 0 %.6f%%;width:%.6f%%;height:6px;min-width:0;box-sizing:border-box;opacity:%s;padding:0;border:0;%s%s'.format(
				100 / members.length, 100 / members.length,
				link ? 1 : .3, firewall.getZoneColorStyle(member.zone),
				index ? ';border-left:2px solid var(--background-color-highest,#fff);' : '')
		}, []);
	});

	return E('div', {
		'class': 'ifacebox',
		'style': 'margin:.35em;width:132px;min-height:190px;overflow:visible;border-radius:6px'
	}, [
		E('div', { 'class': 'ifacebox-head', 'style': 'font-weight:bold' }, [ name ]),
		E('div', { 'class': 'ifacebox-body', 'style': 'padding:.75em .25em' }, [
			E('img', {
				'src': L.resource('icons/port_%s.svg').format(link ? 'up' : 'down'),
				'style': 'width:48px;height:48px'
			}),
			E('br'),
			E('span', {}, [ speedText(link, speed, duplex) ])
		]),
		E('div', {
			'class': 'be6500-port-divider cbi-tooltip-container',
			'style': 'display:block;position:relative;width:100%;height:6px;min-height:6px;padding:0;margin:0;border:0;overflow:visible'
		}, [
			E('div', { 'style': 'display:flex;width:100%;height:6px;padding:0;margin:0;overflow:hidden' }, segments),
			E('span', { 'class': 'cbi-tooltip left' }, [ renderNetworksTooltip(mapping) ])
		]),
		E('div', { 'style': 'font-size:.85em;line-height:1.55;text-align:left;padding:.55em .9em;white-space:nowrap' }, [
			E('div', {}, [ '\u2193 ', byteText(rxBytes) ]),
			E('div', {}, [ '\u2191 ', byteText(txBytes) ])
		])
	]);
}

return baseclass.extend({
	title: _('端口状态'),

	load: function() {
		return Promise.all([
			L.resolveDefault(callGetBuiltinEthernetPorts(), []),
			L.resolveDefault(callGetSwconfigPortState('switch1'), []),
			network.getDevices(),
			L.resolveDefault(firewall.getZones(), []),
			L.resolveDefault(network.getNetworks(), []),
			uci.load('network')
		]);
	},

	render: function(data) {
		var switchPorts = data[1] || [];
		var portMap = buildPortMapping(data[3] || [], data[4] || []);

		/* QWRT/JDC-BE6500 topology: eth0 is WAN, switch1 port 0 is the
		 * internal CPU port, and switch1 ports 1-3 are the three sockets. */
		if (switchPorts.length) {
			var eth0 = null;
			for (var i = 0; i < data[2].length; i++)
				if (data[2][i].getName() == 'eth0')
					eth0 = data[2][i];

			var cards = [ portCard(
				'WAN',
				eth0 ? eth0.getCarrier() : false,
				eth0 ? eth0.getSpeed() : 0,
				eth0 ? eth0.getDuplex() : false,
				portMap.eth0,
				eth0 ? eth0.getRXBytes() : 0,
				eth0 ? eth0.getTXBytes() : 0
			) ];

			/* The chassis labels follow the QCA8386 physical port numbers. */
			var socketPorts = [ 3, 2, 1 ];
			for (var p = 1; p <= 3; p++) {
				var switchPort = socketPorts[p - 1];
				var state = switchPorts.find(function(s) { return s.port == switchPort; }) || {};
				cards.push(portCard('LAN' + p, !!state.link, +state.speed || 0,
					/* On a LAN socket, switch RX is client upload and switch TX is
					 * client download.  Swap them to match the arrows shown to users. */
					!!state.duplex, portMap['switch1:' + switchPort], state.tx_bytes, state.rx_bytes));
			}

			return E('div', {
				'style': 'display:grid;grid-template-columns:repeat(4,minmax(116px,1fr));gap:1em;margin-bottom:1em;align-items:center;justify-items:center;text-align:center;overflow-x:auto'
			}, cards);
		}

		return E('div', { 'class': 'alert-message warning' }, [
			_('未读取到 QCA8386 物理端口状态')
		]);
	}
});
