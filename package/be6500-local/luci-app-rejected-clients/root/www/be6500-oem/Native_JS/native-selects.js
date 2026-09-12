(function () {
  'use strict';

  if (window.__be6500NativeSelects) return;
  window.__be6500NativeSelects = true;

  function text(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function optionNodes(box) {
    var list = box.querySelector('.option');
    if (!list) return [];
    return Array.prototype.filter.call(list.querySelectorAll('a, button, [data-value], [index]'), function (node) {
      return text(node) !== '';
    });
  }

  function optionValue(box, node, index) {
    var value = node.getAttribute('data-value');
    if (value == null) value = node.getAttribute('index');
    if (value == null) value = node.getAttribute('value');
    if (value != null) return String(value);

    var boxId = String(box && box.id || '');
    var label = text(node);
    if (boxId.indexOf('_encrypt') > -1) {
      return ['none', 'psk-mixed', 'psk2', 'sae-mixed', 'sae'][index] || 'psk2';
    }
    if (boxId.indexOf('_bandwidth') > -1) {
      return String([0, 1, 2, 4][index] == null ? 0 : [0, 1, 2, 4][index]);
    }
    if (boxId.indexOf('_power') > -1) {
      return String([2, 1, 0][index] == null ? 2 : [2, 1, 0][index]);
    }
    if (boxId.indexOf('_channel') > -1) {
      return label === '自动' ? '0' : label;
    }
    return String(index);
  }

  function currentValue(box, items) {
    var source = box.querySelector('input[type="hidden"]');
    var shown = text(box.querySelector('.select_txt'));
    var sourceValue = source ? String(source.value) : '';
    var byValue = items.find(function (item, index) { return optionValue(box, item, index) === sourceValue; });
    if (byValue) return optionValue(box, byValue, items.indexOf(byValue));
    var byText = items.find(function (item) { return text(item) === shown; });
    return byText ? optionValue(box, byText, items.indexOf(byText)) : (items[0] ? optionValue(box, items[0], 0) : '');
  }

  function refresh(box) {
    var select = box.__be6500Select;
    if (!select) return;
    var items = optionNodes(box);
    if (!items.length) return;
    var signature = items.map(function (item, index) { return optionValue(box, item, index) + '\u0000' + text(item); }).join('\u0001');
    if (signature !== select.__signature) {
      select.innerHTML = '';
      items.forEach(function (item, index) {
        var option = document.createElement('option');
        option.value = optionValue(box, item, index);
        option.textContent = text(item);
        select.appendChild(option);
      });
      select.__signature = signature;
    }
    var value = currentValue(box, items);
    if (select.value !== value) select.value = value;
    select.disabled = box.classList.contains('disabled') || box.getAttribute('aria-disabled') === 'true';
  }

  function convert(box) {
    if (!box || box.__be6500Select || box.closest('.native-select')) return;
    var items = optionNodes(box);
    if (!items.length) return;
    var select = document.createElement('select');
    select.className = 'native-plain-select be-native-select be-oem-select';
    select.setAttribute('aria-label', text(box.closest('.list') && box.closest('.list').querySelector('.form_left')) || '请选择');
    box.parentNode.insertBefore(select, box);
    box.classList.add('be-select-source');
    box.__be6500Select = select;
    select.__be6500Source = box;
    refresh(box);
    select.addEventListener('change', function () {
      var choices = optionNodes(box);
      var chosen = choices.find(function (item, index) { return optionValue(box, item, index) === select.value; });
      var source = box.querySelector('input[type="hidden"]');
      if (chosen) {
        chosen.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } else if (source) {
        source.value = select.value;
        source.dispatchEvent(new Event('input', { bubbles: true }));
        source.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.setTimeout(function () { refresh(box); }, 0);
    });
  }

  function ensureBandwidthOptions() {
    ['wifi2g', 'wifi5g', 'wifi52g'].forEach(function (name) {
      var list = document.getElementById(name + '_bandwidth_option');
      if (!list) return;
      if (name === 'wifi52g') {
        Array.prototype.forEach.call(list.querySelectorAll('a'), function (item) {
          if (text(item).indexOf('160') !== -1) item.remove();
        });
      }
      if (optionNodes(list.parentNode).length) return;
      var labels = name === 'wifi2g'
        ? ['抗干扰模式 (20MHz)', '高性能模式 (40MHz)']
        : name === 'wifi52g'
          ? ['兼容模式 (20MHz)', '高性能模式 (40MHz)', '超高性能模式 (80MHz)']
          : ['兼容模式 (20MHz)', '高性能模式 (40MHz)',
            '超高性能模式 (80MHz)', '顶级性能模式 (160MHz)'];
      labels.forEach(function (label) {
        var item = document.createElement('a');
        item.textContent = label;
        list.appendChild(item);
      });
    });
  }

  function scan() {
    ensureBandwidthOptions();
    document.querySelectorAll('.select_box').forEach(convert);
    document.querySelectorAll('.select_box').forEach(refresh);
  }

  function start() {
    scan();
    var observer = new MutationObserver(function () { window.requestAnimationFrame(scan); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(scan, 400);

    /* Keep the native replacement in sync with the real persisted radio mode.
     * The factory bundle updates its hidden input after an asynchronous RPC,
     * which can race the select conversion. */
    if (window.jQuery && document.getElementById('js_mode_switch')) {
      window.jQuery.ajax({
        url: '/cgi-bin/luci/admin/network/be6500_oem_beta/jdcapi',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call',
          params: ['qwert-native', 'jdcapi.static', 'get_wifi_freq_mode', {}] }),
        success: function (reply) {
          var payload = reply && reply.result && reply.result[1];
          var mode = payload && Number(payload.mode) === 1 ? '1' : '0';
          var box = document.getElementById('js_mode_switch');
          var source = box && box.querySelector('input[type="hidden"]');
          var shown = box && box.querySelector('.select_txt');
          if (source) source.value = mode;
          if (shown) shown.textContent = mode === '1' ? '三频模式' : '双频模式';
          if (box) refresh(box);
        }
      });
    }

    function syncWifiBandwidth(type, name) {
      if (!window.jQuery || !document.getElementById('js_' + name + '_bandwidth')) return;
      window.jQuery.ajax({
        url: '/cgi-bin/luci/admin/network/be6500_oem_beta/jdcapi',
        type: 'POST', dataType: 'json', contentType: 'application/json',
        data: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call',
          params: ['qwert-native', 'jdcapi.static', 'get_wifi_info', { type: type }] }),
        success: function (reply) {
          var payload = reply && reply.result && reply.result[1];
          var row = payload && payload.data && payload.data[0];
          if (!row) return;
          var value = String(Number(row.htmode) || 0);
          var box = document.getElementById('js_' + name + '_bandwidth');
          var source = box && box.querySelector('input[type="hidden"]');
          if (source) {
            source.value = value;
            source.setAttribute('data-old-bandwidth-' + (name === 'wifi2g' ? '2g' : name === 'wifi5g' ? '5g' : '52g'), value);
          }
          if (box) refresh(box);
        }
      });
    }
    syncWifiBandwidth(0, 'wifi2g');
    syncWifiBandwidth(2, 'wifi5g');
    syncWifiBandwidth(4, 'wifi52g');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
