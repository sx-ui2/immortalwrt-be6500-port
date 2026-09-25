'use strict';
'require baseclass';
'require rpc';

var callSwitchPorts = rpc.declare({
	object: 'luci',
	method: 'getSwconfigPortState',
	params: [ 'switch' ],
	expect: { result: [] }
});

function portCard(name, number, states) {
	var state = states[number] || {};
	var link = !!state.link;
	var speed = +state.speed || 0;
	var status = !link ? _('未连接') :
		(speed >= 1000 ? '%s Gbps'.format(speed / 1000) : '%s Mbps'.format(speed));

	return E('div', {
		'class': 'ifacebox',
		'style': 'min-width:128px;margin:0'
	}, [
		E('div', { 'class': 'ifacebox-head center' }, [ name ]),
		E('div', { 'class': 'ifacebox-body center' }, [
			E('img', {
				'src': L.resource('icons/port_%s.svg').format(link ? 'up' : 'down'),
				'style': 'width:48px;height:48px'
			}),
			E('br'),
			E('strong', { 'style': 'color:%s'.format(link ? '#2ca25f' : '#888') }, [
				link ? '\u25cf ' : '\u25cb ', status
			]),
			E('br'),
			E('small', {}, [ _('QCA8386 物理交换端口 %d').format(number) ])
		])
	]);
}

/* A LuCI dependency must return a baseclass constructor.  The old cached
 * be6500.ports path once returned a plain object and caused LuCI's module
 * loader to abort the entire Devices page.  Keep a versioned module name so
 * browsers cannot reuse that invalid factory. */
return baseclass.extend({
	load: function() {
		return L.resolveDefault(callSwitchPorts('switch1'), []);
	},

	render: function(ports) {
		var states = {};
		L.toArray(ports).forEach(function(state) {
			states[+state.port] = state;
		});

		return E('div', { 'data-be6500-physical-ports': 'v45' }, [
			E('p', {}, [
				_('LAN1–LAN3 是交换芯片上的真实物理端口，不是可独立配置的 Linux 网卡；VLAN 由交换机页面管理，端口用途由路由设置中的端口设置管理。')
			]),
			E('div', { 'style': 'display:flex;gap:12px;flex-wrap:wrap;margin:12px 0' }, [
				portCard('LAN1', 3, states),
				portCard('LAN2', 2, states),
				portCard('LAN3', 1, states)
			]),
			E('a', {
				'class': 'btn cbi-button cbi-button-action',
				'href': L.url('admin/router_settings/ports')
			}, [ _('打开端口设置') ])
		]);
	}
});
