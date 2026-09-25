'use strict';
'require baseclass';
'require rpc';

var callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info'
});

var callMountPoints = rpc.declare({
	object: 'luci',
	method: 'getMountPoints',
	expect: { result: [] }
});

var callBlockDevices = rpc.declare({
	object: 'luci',
	method: 'getBlockDevices',
	expect: { '': {} }
});

var callSystemBoard = rpc.declare({
	object: 'system',
	method: 'board'
});

function progressbar(value, max) {
	var used = Math.max(0, +value || 0),
	    total = Math.max(1, +max || 0),
	    percent = Math.min(100, Math.floor((100 / total) * used));

	return E('div', {
		'class': 'cbi-progressbar',
		'title': '%s / %s (%d%%)'.format(
			String.format('%1024.2mB', used),
			String.format('%1024.2mB', total),
			percent)
	}, E('div', { 'style': 'width:%.2f%%'.format(percent) }));
}

function row(title, content) {
	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'width': '33%' }, [ title ]),
		E('td', { 'class': 'td left' }, [ content ])
	]);
}

function sameFilesystem(first, second) {
	if (!first || !second)
		return false;

	return +first.total > 0 && +first.total == +second.total &&
		Math.abs((+first.free || 0) - (+second.free || 0)) < 4096;
}

return baseclass.extend({
	title: _('Storage'),

	load: function() {
		return Promise.all([
			L.resolveDefault(callSystemInfo(), {}),
			L.resolveDefault(callMountPoints(), []),
			L.resolveDefault(callBlockDevices(), {}),
			L.resolveDefault(callSystemBoard(), {})
		]);
	},

	render: function(data) {
		var systeminfo = L.isObject(data[0]) ? data[0] : {};
		var mounts = L.toArray(data[1]);
		var blocks = L.isObject(data[2]) ? data[2] : {};
		var board = L.isObject(data[3]) ? data[3] : {};
		var root = L.isObject(systeminfo.root) ? systeminfo.root : {};
		var tmp = L.isObject(systeminfo.tmp) ? systeminfo.tmp : {};
		var rows = [];
		var overlay = null;

		/* Raw eMMC capacity is independent from the currently mounted root. It
		 * remains correct in recovery/initramfs mode and when overlay failed. */
		Object.keys(blocks).sort().forEach(function(name) {
			var entry = blocks[name] || {};
			if (/^mmcblk\d+$/.test(name) && +entry.size > 0)
				rows.push(row(_('物理 eMMC 容量'),
					String.format('%1024.2mB', +entry.size)));
		});

		for (var i = 0; i < mounts.length; i++) {
			if (mounts[i].mount == '/overlay') {
				overlay = mounts[i];
				break;
			}
		}

		if (overlay && +overlay.size > 0) {
			rows.push(row(_('系统可写空间'),
				progressbar(+overlay.size - (+overlay.free || 0), +overlay.size)));
		}
		else if (board.rootfs_type == 'initramfs' || sameFilesystem(root, tmp)) {
			rows.push(row(_('根目录（RAM，持久化存储未挂载）'),
				progressbar((+root.used || 0) * 1024, (+root.total || 0) * 1024)));
		}
		else {
			rows.push(row(_('系统可写空间'),
				progressbar((+root.used || 0) * 1024, (+root.total || 0) * 1024)));
		}

		rows.push(row(_('Temp space'),
			progressbar((+tmp.used || 0) * 1024, (+tmp.total || 0) * 1024)));

		/* Show actually mounted external filesystems separately. */
		mounts.forEach(function(entry) {
			if ([ '/', '/rom', '/overlay', '/tmp', '/dev' ].indexOf(entry.mount) >= 0 ||
			    !entry.device || !/^\/dev\/(sd|nvme|mmcblk)/.test(entry.device) ||
			    +entry.size <= 0)
				return;

			rows.push(row('%s (%s)'.format(entry.device, entry.mount),
				progressbar(+entry.size - (+entry.free || 0), +entry.size)));
		});

		return E('table', { 'class': 'table' }, rows);
	}
});
