'use strict';
'require baseclass';
'require rpc';

var callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info'
});

function progressbar(value, max) {
	var used = parseInt(value) || 0,
	    total = parseInt(max) || 100,
	    percent = Math.floor((100 / total) * used);

	return E('div', {
		'class': 'cbi-progressbar',
		'title': '%s / %s (%d%%)'.format(
			String.format('%1024.2mB', used),
			String.format('%1024.2mB', total),
			percent)
	}, E('div', { 'style': 'width:%.2f%%'.format(percent) }));
}

return baseclass.extend({
	title: _('Storage'),

	load: function() {
		return L.resolveDefault(callSystemInfo(), {});
	},

	render: function(systeminfo) {
		var root = L.isObject(systeminfo.root) ? systeminfo.root : {},
		    tmp = L.isObject(systeminfo.tmp) ? systeminfo.tmp : {};

		return E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ _('Disk space') ]),
				E('td', { 'class': 'td left' }, [ progressbar(root.used * 1024, root.total * 1024) ])
			]),
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ _('Temp space') ]),
				E('td', { 'class': 'td left' }, [ progressbar(tmp.used * 1024, tmp.total * 1024) ])
			])
		]);
	}
});
