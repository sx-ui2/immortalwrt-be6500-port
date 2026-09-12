'use strict';
'require baseclass';
'require rpc';

var callSystemInfo = rpc.declare({ object: 'system', method: 'info' });
var callSystemBoard = rpc.declare({ object: 'system', method: 'board' });

function progressbar(value, max, byte) {
	var vn = parseInt(value) || 0, mn = parseInt(max) || 100,
	    fv = byte ? String.format('%1024.2mB', value) : value,
	    fm = byte ? String.format('%1024.2mB', max) : max,
	    pc = Math.floor((100 / mn) * vn);
	return E('div', { 'class': 'cbi-progressbar', 'title': '%s / %s (%d%%)'.format(fv, fm, pc) },
		E('div', { 'style': 'width:%.2f%%'.format(pc) }));
}

return baseclass.extend({
	title: _('Memory'),
	load: function() {
		return Promise.all([L.resolveDefault(callSystemInfo(), {}), L.resolveDefault(callSystemBoard(), {})]);
	},
	render: function(data) {
		var systeminfo = data[0], boardinfo = data[1],
		    mem = L.isObject(systeminfo.memory) ? systeminfo.memory : {},
		    swap = L.isObject(systeminfo.swap) ? systeminfo.swap : {};
		var fields = [
			_('Total Available'), mem.available ? mem.available : (mem.total && mem.free && mem.buffered) ? mem.free + mem.buffered : null, mem.total,
			_('Used'), (mem.total && mem.free) ? Math.max(0, mem.total - mem.free - (mem.buffered || 0) - (mem.cached || 0)) : null, mem.total
		];
		if (mem.buffered) fields.push(_('Buffered'), mem.buffered, mem.total);
		if (mem.cached) fields.push(_('Cached'), mem.cached, mem.total);
		if (swap.total > 0) fields.push('已用交换区', swap.total - swap.free, swap.total);

		var table = E('table', { 'class': 'table' });
		if (boardinfo.board_name == 'jdcloud,be6500')
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ '物理内存' ]),
				E('td', { 'class': 'td left' }, [ String.format('%1024.2mB', 1024 * 1024 * 1024) ])
			]));
		for (var i = 0; i < fields.length; i += 3)
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ fields[i] ]),
				E('td', { 'class': 'td left' }, [ fields[i + 1] != null ? progressbar(fields[i + 1], fields[i + 2], true) : '?' ])
			]));
		return table;
	}
});
