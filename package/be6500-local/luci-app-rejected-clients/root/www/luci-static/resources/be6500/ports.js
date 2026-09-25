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
			E('strong', { 'style': 'color:%s'.format(link ? '#2ca25f' : '#888') }, [
				link ? '\u25cf ' : '\u25cb ', status
			]),
			E('br'),
			E('small', {}, [ _('物理交换端口') ])
		])
	]);
}

return baseclass.extend({
	load: function() {
		return callSwitchPorts('switch1');
	},

	render: function(ports) {
		var states = {};
		L.toArray(ports).forEach(function(state) {
			states[+state.port] = state;
		});

		return E('div', { 'data-be6500-physical-ports': '1' }, [
			E('p', {}, [
				_('LAN1–LAN3 是 QCA8386 的真实物理交换端口，由交换机统一承载，不是独立 Linux 网卡。')
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
