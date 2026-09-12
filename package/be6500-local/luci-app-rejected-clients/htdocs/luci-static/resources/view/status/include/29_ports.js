'use strict';
'require baseclass';
'require rpc';
'require network';

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

function portCard(name, link, speed, duplex, role, rxBytes, txBytes) {
	var color = role == 'wan' ? '#f39c12' : '#35b779';

	return E('div', {
		'class': 'ifacebox',
		'style': 'margin:.35em;width:132px;min-height:190px;overflow:hidden;border-radius:6px'
	}, [
		E('div', { 'class': 'ifacebox-head', 'style': 'font-weight:bold;border-top:6px solid %s'.format(color) }, [ name ]),
		E('div', { 'class': 'ifacebox-body', 'style': 'padding:.75em .25em' }, [
			E('img', {
				'src': L.resource('icons/port_%s.svg').format(link ? 'up' : 'down'),
				'style': 'width:48px;height:48px'
			}),
			E('br'),
			E('span', {}, [ speedText(link, speed, duplex) ])
		]),
		E('div', {
			'class': 'be6500-port-divider',
			'style': 'display:block;height:6px;min-height:6px;background:%s!important;opacity:%s;padding:0;border:0'.format(color, link ? 1 : .3)
		}, []),
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
			network.getDevices()
		]);
	},

	render: function(data) {
		var switchPorts = data[1] || [];

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
				'wan',
				eth0 ? eth0.getRXBytes() : 0,
				eth0 ? eth0.getTXBytes() : 0
			) ];

			/* The chassis labels run opposite to the QCA8386 port numbers:
			 * LAN1 = switch port 3, LAN2 = port 2, LAN3 = port 1. */
			var socketPorts = [ 3, 2, 1 ];
			for (var p = 1; p <= 3; p++) {
				var switchPort = socketPorts[p - 1];
				var state = switchPorts.find(function(s) { return s.port == switchPort; }) || {};
				cards.push(portCard('LAN' + p, !!state.link, +state.speed || 0,
					/* On a LAN socket, switch RX is client upload and switch TX is
					 * client download.  Swap them to match the arrows shown to users. */
					!!state.duplex, 'lan', state.tx_bytes, state.rx_bytes));
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
