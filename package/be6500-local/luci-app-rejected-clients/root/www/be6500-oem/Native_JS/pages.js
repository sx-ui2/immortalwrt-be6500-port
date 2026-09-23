(function () {
  'use strict';

  var API = '/cgi-bin/luci/admin/network/be6500_oem_beta/jdcapi';
  var path = window.BE6500_PAGE_PATH || location.pathname;
  var state = {};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function id(name) { return document.getElementById(name); }
  function value(name) { var node = id(name); return node ? node.value.trim() : ''; }
  function checked(name) { var node = id(name); return !!(node && node.checked); }
  function number(name, fallback) { var n = Number(value(name)); return isFinite(n) ? n : (fallback || 0); }
  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).sort(function (a, b) {
      var an = Number(a), bn = Number(b);
      return isFinite(an) && isFinite(bn) ? an - bn : String(a).localeCompare(String(b));
    }).map(function (key) { return value[key]; }).filter(function (item) { return item != null; });
  }
  function deviceDisplayName(name, mac) {
    name = String(name || '').trim();
    if (name && name !== '*' && name !== '-' && name !== '未知设备' && name !== 'Unknown') return name;
    var suffix = String(mac || '').replace(/[^0-9a-f]/gi, '').slice(-4).toUpperCase();
    return suffix ? '设备-' + suffix : '未命名设备';
  }
  function rejectedWifiName(name, mac) {
    name = String(name || '').trim();
    var suffix = String(mac || '').replace(/[^0-9a-f]/gi, '').slice(-4).toUpperCase();
    if (/^有线设备-[0-9a-f]{4}$/i.test(name) && name.slice(-4).toUpperCase() === suffix)
      return '无线设备-' + suffix;
    return deviceDisplayName(name, mac);
  }
  function normalizeMac(mac) {
    var compact = String(mac || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
    if (compact.length === 12)
      return compact.replace(/(..)(?=.)/g, '$1:');
    return String(mac || '').trim().toUpperCase().replace(/-/g, ':');
  }
  function jsonResponse(response) {
    if (response.status === 403 && response.headers.get('x-luci-login-required')) {
      var host = window.parent && window.parent !== window ? window.parent : window;
      window.setTimeout(function () { host.location.reload(); }, 300);
      return Promise.reject(new Error('登录会话已过期，正在重新进入登录页面'));
    }
    return response.text().then(function (body) {
      var text = String(body || '').trim();
      // Some LuCI/uhttpd combinations prefix XHR output with an HTML comment
      // as an XSSI guard.  Only discard it when the remaining payload is JSON.
      if (text.slice(0, 4) === '<!--') {
        var marker = text.indexOf('-->');
        var tail = marker >= 0 ? text.slice(marker + 3).trim() : '';
        if (tail.charAt(0) === '{' || tail.charAt(0) === '[') text = tail;
      }
      try {
        var data = JSON.parse(text);
        if (!response.ok) {
          var failure = new Error((data && data.message) || ('路由器请求失败（HTTP ' + response.status + '）'));
          failure.status = response.status;
          throw failure;
        }
        return data;
      } catch (error) {
        if (error && error.status) throw error;
        if (!response.ok) {
          var httpFailure = new Error(response.status === 500
            ? '路由器处理请求时发生异常，请刷新后重试；若持续出现请查看系统日志'
            : '路由器请求失败（HTTP ' + response.status + '）');
          httpFailure.status = response.status;
          throw httpFailure;
        }
        if (text.charAt(0) === '<')
          throw new Error('服务器返回了网页而不是配置数据，请刷新页面后重试');
        throw new Error('服务器返回的数据格式无效，请刷新页面后重试');
      }
    });
  }
  function rpc(method, args) {
    return fetch(API, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: ['qwert-native', 'jdcapi.static', method, args || {}] })
    }).then(jsonResponse).then(function (response) {
      if (!response.result || response.result[0] !== 0) throw new Error((response.error && response.error.message) || '接口调用失败');
      if (response.result[1] && response.result[1].status != null && Number(response.result[1].status) !== 0) throw new Error(response.result[1].message || ('操作失败（' + response.result[1].status + '）'));
      return response.result[1] || {};
    });
  }
  function notify(message, ok) {
    var host = window.parent && window.parent !== window ? window.parent : window;
    if (ok !== false) return;
    if (host.L && typeof host.L.require === 'function') {
      host.L.require('ui').then(function (ui) {
        var text = host.document.createElement('p');
        text.textContent = message;
        ui.addNotification(null, text, ok === false ? 'danger' : 'info');
      }).catch(function () { inlineNotification(message, ok); });
    } else {
      inlineNotification(message, ok);
    }
  }
  function applyingModal(message) {
    var host = window.parent && window.parent !== window ? window.parent : window;
    if (!(host.L && typeof host.L.require === 'function')) return Promise.resolve(null);
    return host.L.require('ui').then(function (ui) {
      var row = host.document.createElement('div');
      var spinner = host.document.createElement('span');
      var text = host.document.createElement('span');
      row.className = 'spinning';
      spinner.className = 'loading';
      text.textContent = message || '正在等待配置被应用…';
      row.appendChild(spinner); row.appendChild(text);
      ui.showModal(null, [row]);
      return ui;
    }).catch(function () { return null; });
  }
  function inlineNotification(message, ok) {
    var mount = document.getElementById('be6500-native-root') || document.body;
    var bar = id('native-message');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'native-message';
      mount.insertBefore(bar, mount.firstChild);
    }
    bar.className = 'alert-message ' + (ok === false ? 'danger' : 'info');
    bar.textContent = message;
    bar.style.display = '';
    clearTimeout(window.__nativeMessageTimer);
    window.__nativeMessageTimer = setTimeout(function () { bar.style.display = 'none'; }, 5000);
  }
  function busy(button, promise, doneText) {
    if (!button) return promise;
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '正在保存…';
    var modal = applyingModal('正在等待配置被应用…');
    return promise.then(function (result) {
      button.textContent = doneText || '保存成功';
      modal.then(function (ui) { if (ui) ui.hideModal(); });
      setTimeout(function () { button.disabled = false; button.textContent = old; }, 1000);
      return result;
    }).catch(function (error) {
      modal.then(function (ui) { if (ui) ui.hideModal(); });
      button.disabled = false;
      button.textContent = old;
      notify(error.message || '保存失败', false);
      throw error;
    });
  }
  function bindClick(selector, handler) {
    var node = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!node) return;
    node.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handler.call(node, event);
    }, true);
  }
  function page(title, body) {
    if (window.__nativeDeviceTimer) {
      clearInterval(window.__nativeDeviceTimer);
      window.__nativeDeviceTimer = null;
    }
    var advanced = /seniorManagement\//.test(path);
    var management = /management\//.test(path);
    var open = advanced ? '<div class="cbi-section seniorManagement_Box native-card native-advanced"><h3 class="cbi-section-title seniorManagement_top">' + esc(title) + '</h3>' :
      management ? '<div class="cbi-section box native-card native-management"><h3 class="cbi-section-title title"><span class="text">' + esc(title) + '</span></h3>' :
      '<div class="cbi-section block native-card native-router"><h2 class="cbi-section-title native-page-title"><span class="title-one">' + esc(title) + '</span></h2>';
    var mount = document.getElementById('be6500-native-root') || document.body;
    mount.innerHTML = '<main class="cbi-map native-page">' + open + body + '</div></main>';
    normalizeControls(mount);
    initPasswordButtons(mount);
    if (window.__be6500ControlObserver) window.__be6500ControlObserver.disconnect();
    window.__be6500ControlObserver = new MutationObserver(function (changes) {
      changes.forEach(function (change) { change.addedNodes.forEach(function (node) { if (node.nodeType === 1) { normalizeControls(node); initPasswordButtons(node); } }); });
    });
    window.__be6500ControlObserver.observe(mount, { childList: true, subtree: true });
    initToggleImages();
    initNativeSelects();
    if (window.parent && window.parent.setHeight) setTimeout(function () { window.parent.setHeight(document.body.scrollHeight + 40, 850); }, 50);
  }
  function row(label, control, help) {
    return '<div class="cbi-value row list native-row"><label class="cbi-value-title form_left text-left">' + esc(label) + '</label><div class="cbi-value-field form_right native-control">' + control + (help ? '<div class="cbi-value-description native-help">' + esc(help) + '</div>' : '') + '</div></div>';
  }
  function section(title, body) { return '<section class="cbi-section native-section"><h3 class="cbi-section-title native-section-title">' + esc(title) + '</h3><div class="cbi-section-node">' + body + '</div></section>'; }
  function input(name, type, placeholder, attrs) {
    return '<input id="' + name + '" class="cbi-input-text" type="' + (type || 'text') + '" placeholder="' + esc(placeholder || '') + '" ' + (attrs || '') + '>';
  }
  function password(name, placeholder) {
    return '<div class="native-password">' + input(name, 'password', placeholder || '') +
      '<button type="button" class="btn cbi-button cbi-button-neutral" data-password="' + name + '" aria-label="显示或隐藏密码" title="显示或隐藏密码">*</button></div>';
  }
  function wifiEncryptionOptions() {
    return [['wpa3-192','WPA3-EAP 192-bit Mode（强安全性）'],['psk2','WPA2-PSK（强安全性）'],
      ['wpa2','WPA2-EAP（强安全性）'],['wpa3','WPA3-EAP（强安全性）'],
      ['wpa3-mixed','WPA2-EAP/WPA3-EAP Mixed Mode（强安全性）'],['sae','WPA3-SAE（强安全性）'],
      ['sae-mixed','WPA2-PSK/WPA3-SAE Mixed Mode（强安全性）'],
      ['psk-mixed','WPA-PSK/WPA2-PSK Mixed Mode（中等安全性）'],['wpa','WPA-EAP（中等安全性）'],
      ['psk','WPA-PSK（弱安全性）'],['owe','OWE（开放网络）'],['none','无加密（开放网络）']];
  }
  function wifiSecurityFields(prefix) {
    return row('加密方式',select(prefix+'-encryption',wifiEncryptionOptions()))+
      '<div id="'+prefix+'-password-row">'+row('密码',password(prefix+'-password','8–63 位密码'))+'</div>'+
      '<div id="'+prefix+'-radius-fields">'+row('RADIUS 地址',input(prefix+'-radius-address','text','例如 192.168.1.10','maxlength="255"'))+
      row('RADIUS 端口',input(prefix+'-radius-port','number','1812','min="1" max="65535"'))+
      row('RADIUS 密钥',password(prefix+'-radius-secret','RADIUS 共享密钥'))+'</div>';
  }
  function isPersonalEncryption(value) { return ['psk','psk-mixed','psk2','sae-mixed','sae'].indexOf(value)>=0; }
  function isEnterpriseEncryption(value) { return ['wpa','wpa2','wpa3','wpa3-mixed','wpa3-192'].indexOf(value)>=0; }
  function syncWifiSecurity(prefix) {
    var encryption=value(prefix+'-encryption');
    show('#'+prefix+'-password-row',isPersonalEncryption(encryption));
    show('#'+prefix+'-radius-fields',isEnterpriseEncryption(encryption));
  }
  function select(name, options) {
    return '<select id="' + name + '" class="cbi-input-select">' + options.map(function (item) {
      return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>';
    }).join('') + '</select>';
  }
  function multiSelect(name) {
    return '<div id="' + name + '" class="native-luci-dropdown"></div>';
  }
  function toggle(name, label) {
    return '<div class="cbi-checkbox native-checkbox"><input id="' + name + '" type="checkbox">' +
      '<label for="' + name + '"></label>' + (label ? '<b>' + esc(label) + '</b>' : '') + '</div>';
  }
  function buttons(primary, secondary) {
    return '<div class="cbi-page-actions native-actions"><button type="button" class="btn cbi-button cbi-button-apply" id="' + primary[0] + '">' + esc(primary[1]) + '</button>' +
      (secondary ? '<button type="button" class="btn cbi-button cbi-button-neutral" id="' + secondary[0] + '">' + esc(secondary[1]) + '</button>' : '') + '</div>';
  }
  function normalizeControls(root) {
    var nodes = [];
    if (root.matches && root.matches('button')) nodes.push(root);
    if (root.querySelectorAll) nodes = nodes.concat([].slice.call(root.querySelectorAll('button')));
    nodes.forEach(function (button) {
      if (button.hasAttribute('data-password')) return;
      button.classList.add('btn', 'cbi-button');
      if (button.classList.contains('native-danger') || button.classList.contains('delete') || /删除|清除|移出/.test(button.textContent)) button.classList.add('cbi-button-negative');
      else if (button.classList.contains('native-primary')) button.classList.add('cbi-button-apply');
      else if (button.classList.contains('edit')) button.classList.add('cbi-button-edit');
      else if (!/cbi-button-(apply|positive|negative|action|add|edit|neutral|reset)/.test(button.className)) button.classList.add('cbi-button-neutral');
      button.classList.remove('native-primary', 'native-secondary', 'native-add-button', 'native-hand-button');
    });
  }
  function confirmDialog(title, message) {
    return new Promise(function (resolve) {
      var host = window.parent && window.parent !== window ? window.parent : window;
      if (host.L && typeof host.L.require === 'function') {
        host.L.require('ui').then(function (ui) {
          var text = host.document.createElement('p');
          var actions = host.document.createElement('div');
          var cancel = host.document.createElement('button');
          var confirm = host.document.createElement('button');
          text.textContent = message;
          actions.className = 'right cbi-page-actions';
          cancel.className = 'btn cbi-button cbi-button-neutral'; cancel.textContent = '取消';
          confirm.className = 'btn cbi-button cbi-button-positive important'; confirm.textContent = '确认';
          cancel.addEventListener('click', function () { ui.hideModal(); resolve(false); });
          confirm.addEventListener('click', function () { ui.hideModal(); resolve(true); });
          actions.appendChild(cancel); actions.appendChild(confirm);
          ui.showModal(title, [text, actions]);
        }).catch(function () { fallbackConfirmDialog(title, message, resolve); });
        return;
      }
      fallbackConfirmDialog(title, message, resolve);
    });
  }
  function fallbackConfirmDialog(title, message, resolve) {
      var overlay = id('modal_overlay');
      if (!overlay) { overlay = document.createElement('div'); overlay.id = 'modal_overlay'; document.body.appendChild(overlay); }
      overlay.innerHTML = '<div class="modal cbi-modal" role="dialog" aria-modal="true" aria-labelledby="be6500-dialog-title"><h4 id="be6500-dialog-title">' + esc(title) + '</h4><p>' + esc(message) + '</p><div class="right cbi-page-actions"><button type="button" class="btn cbi-button cbi-button-neutral" data-answer="0">取消</button> <button type="button" class="btn cbi-button cbi-button-positive important" data-answer="1">确认</button></div></div>';
      document.body.classList.add('modal-overlay-active');
      overlay.querySelectorAll('[data-answer]').forEach(function (button) {
        button.addEventListener('click', function () { var answer = button.getAttribute('data-answer') === '1'; document.body.classList.remove('modal-overlay-active'); resolve(answer); });
      });
  }
  function syncNativeSelect(node) {
    return node;
  }
  function set(name, data) { var node = id(name); if (node) { node.value = data == null ? '' : data; syncNativeSelect(node); } }
  function check(name, data) { var node = id(name); if (node) node.checked = !!Number(data); }
  function show(selector, visible) {
    var node = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!node) return;
    node.classList.toggle('native-hidden', !visible);
    node.style.display = visible ? '' : 'none';
  }
  function reloadView(delay) { window.setTimeout(function () { window.location.reload(); }, delay == null ? 350 : delay); }

  function wifiPage() {
    function channelLabel(channel) {
      channel = Number(channel);
      var mhz = channel === 14 ? 2484 : channel <= 14 ? 2407 + channel * 5 : 5000 + channel * 5;
      var note = channel > 14 ? (channel >= 52 && channel <= 144 ? ' · DFS，启用需等待约 60 秒' : ' · 非 DFS') : '';
      return channel + ' (' + mhz + ' MHz)' + note;
    }
    function bandFields(key, title, channels, widths) {
      return '<div id="wifi-band-' + key + '">' + section(title,
        row('启用', toggle('wifi-' + key + '-enabled', '启用')) +
        '<div class="wifi-band-identity">' +
        row('名称', input('wifi-' + key + '-ssid', 'text', '请输入 Wi-Fi 名称', 'maxlength="32"')) +
        row('隐藏网络', toggle('wifi-' + key + '-hidden', '隐藏 SSID')) +
        wifiSecurityFields('wifi-' + key) + '</div>' +
        row('无线信道', select('wifi-' + key + '-channel', [['0',key === '2g' ? 'auto' : 'auto（可能选择 DFS 信道）']].concat(channels.map(function(c){return [String(c),channelLabel(c)];})))) +
        row('频道宽度', select('wifi-' + key + '-bandwidth', widths)) +
        row('信号强度', select('wifi-' + key + '-power', [['2','穿墙'],['1','标准'],['0','节能']]))) + '</div>';
    }
    page('Wi-Fi 设置',
      section('Wi-Fi 模式', row('工作模式', select('wifi-mode', [['0','双频模式'],['1','三频模式']])) + '<p class="native-info" id="wifi-mode-state">正在读取芯片驱动模式…</p>' + buttons(['wifi-mode-save','保存模式'])) +
      section('多频合一',
        row('启用', toggle('wifi-unified', '2.4GHz、5.2GHz 和 5.8GHz 使用相同名称与密码')) +
        row('MLO', toggle('wifi-mlo', '启用多链路操作（支持 WPA3-SAE 或 WPA2/WPA3 混合模式）')) +
        '<p class="native-info" id="wifi-mlo-state">MLO 会把多个频段组成一个 Wi-Fi 7 多链路网络。</p>' +
        '<div id="wifi-unified-fields">' +
        row('名称', input('wifi-unified-ssid', 'text', '请输入统一 Wi-Fi 名称', 'maxlength="32"')) +
        row('隐藏网络', toggle('wifi-unified-hidden', '隐藏统一 SSID')) +
        wifiSecurityFields('wifi-unified') + '</div>') +
      bandFields('2g','2.4GHz', [1,2,3,4,5,6,7,8,9,10,11,12,13], [['20','抗干扰模式 (20/40MHz)'],['40','高性能模式 (40MHz)']]) +
      bandFields('5g','5.2GHz', [36,40,44,48,52,56,60,64], [['20','抗干扰模式 (20/40MHz)'],['40','高性能模式 (40MHz)'],['80','超高性能模式 (80MHz)'],['160','顶级性能模式 (160/80MHz)']]) +
      bandFields('52g','5.8GHz', [100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165], [['20','抗干扰模式 (20/40MHz)'],['40','高性能模式 (40MHz)'],['80','超高性能模式 (80MHz)'],['160','顶级性能模式 (160/80MHz)']]) +
      section('Wi-Fi 5 兼容模式',
        '<p class="native-info">启用后会将所选频段组合切换为兼容模式；2.4GHz 使用 802.11n，5GHz 使用 802.11ac。适用于无法连接 Wi-Fi 6/7 的旧设备。</p>' +
        row('启用', toggle('wifi5-compatible', '启用兼容模式')) +
        '<div id="wifi5-compatible-fields">' + row('生效频段', '<div class="native-checkbox-list">' + toggle('wifi5-band-0', '2.4GHz') + toggle('wifi5-band-1', '5GHz') + toggle('wifi5-band-2', '5.8GHz') + '</div>') + '</div>') +
      buttons(['wifi-save','保存 Wi-Fi 设置']));
    // “顶级性能模式”表示该信道允许的最大频宽：5.8 GHz 的 149 等
    // 高段信道只能使用 80 MHz，100–128 才能使用 160 MHz。
    function normalizeWifiWidth(key) {
      var channel = Number(value('wifi-' + key + '-channel'));
      var width = Number(value('wifi-' + key + '-bandwidth'));
      if (width === 160 && ((key === '52g' && channel >= 149) || (key === '5g' && channel > 64)))
        set('wifi-' + key + '-bandwidth', '80');
    }
    var endpoint='/cgi-bin/luci/admin/network/be6500_oem_beta/native_wifi';
    function ssidWithSuffix(base, suffix) {
      base = String(base || '');
      return base.slice(0, Math.max(0, 32 - suffix.length)) + suffix;
    }
    function splitUnifiedWifiNames() {
      var base = value('wifi-unified-ssid') || value('wifi-2g-ssid');
      if (!base) return;
      var tri = Number(value('wifi-mode')) === 1;
      set('wifi-2g-ssid', base);
      set('wifi-5g-ssid', ssidWithSuffix(base, '_5G'));
      if (tri) set('wifi-52g-ssid', ssidWithSuffix(base, '_5G2'));
      ['hidden','encryption','password','radius-address','radius-port','radius-secret'].forEach(function (option) {
        ['2g','5g','52g'].forEach(function (band) {
          if (option === 'hidden') check('wifi-' + band + '-' + option, checked('wifi-unified-' + option));
          else set('wifi-' + band + '-' + option, value('wifi-unified-' + option));
        });
      });
    }
    function syncWifiOptions() {
      var unified = checked('wifi-unified');
      show('#wifi-unified-fields', unified);
      document.querySelectorAll('.wifi-band-identity').forEach(function (node) { show(node, !unified); });
      show('#wifi5-compatible-fields', checked('wifi5-compatible'));
      var tri = Number(value('wifi-mode')) === 1;
      show('#wifi-band-52g', tri);
      var fiveTitle = document.querySelector('#wifi-band-5g h3');
      if (fiveTitle) fiveTitle.textContent = tri ? '5.2GHz' : '5GHz';
      var unifiedLabel = id('wifi-unified') && id('wifi-unified').closest('.native-checkbox');
      var unifiedText = unifiedLabel && unifiedLabel.querySelector('b');
      if (unifiedText) unifiedText.textContent = tri ? '2.4GHz、5.2GHz 和 5.8GHz 使用相同名称与密码' : '2.4GHz 和 5GHz 使用相同名称与密码';
      var channel = id('wifi-5g-channel'), selected = channel && channel.value;
      if (channel) {
        var list = tri ? [36,40,44,48,52,56,60,64] : [36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165];
        channel.innerHTML = '<option value="0">auto（可能选择 DFS 信道）</option>' + list.map(function (item) { return '<option value="' + item + '">' + channelLabel(item) + '</option>'; }).join('');
        channel.value = list.indexOf(Number(selected)) >= 0 ? selected : '0';
      }
      renderWifi5Bands(tri);
      var mloAllowed = unified && !checked('wifi5-compatible') &&
        ['2g','5g','52g'].filter(function(key){ return (key !== '52g' || tri) && checked('wifi-' + key + '-enabled'); }).length >= 2;
      var mlo = id('wifi-mlo');
      var mloState = id('wifi-mlo-state');
      if (mlo) {
        mlo.disabled = !mloAllowed;
        if (!mloAllowed) mlo.checked = false;
      }
      if (mloState) mloState.textContent = mloAllowed
        ? 'MLO 会把多个频段组成一个 Wi-Fi 7 多链路网络；混合模式下旧设备可使用 WPA2，MLO 设备使用 WPA3-SAE。'
        : 'MLO 需要开启多频合一、关闭 Wi-Fi 5 兼容模式，并启用至少两个频段。';
      ['wifi-unified','wifi-2g','wifi-5g','wifi-52g'].forEach(syncWifiSecurity);
    }
    function selectedWifi5Bands() {
      return [0,1,2].filter(function(index){return (index < 2 || Number(value('wifi-mode')) === 1) && checked('wifi5-band-' + index);});
    }
    function renderWifi5Bands(tri) {
      var second=id('wifi5-band-1')&&id('wifi5-band-1').closest('.native-checkbox');
      var third=id('wifi5-band-2')&&id('wifi5-band-2').closest('.native-checkbox');
      var secondText=second&&second.querySelector('b');
      if(secondText)secondText.textContent=tri?'5.2GHz':'5GHz';
      show(third,tri);
      if(!tri)check('wifi5-band-2',0);
    }
    function load() {
      fetch(endpoint,{credentials:'same-origin',cache:'no-store'}).then(jsonResponse).then(function(data){
        if (!data.ok) throw new Error(data.message || 'Wi-Fi 配置读取失败');
        set('wifi-mode',data.mode||0);
        var modeState=id('wifi-mode-state');
        if(modeState) modeState.textContent=data.mode_pending
          ? '配置尚未生效：当前驱动为'+(Number(data.mode)===1?'三频':'双频')+'，目标为'+(Number(data.configured_mode)===1?'三频':'双频')+'，必须重启后重新检测。'
          : '当前芯片驱动实际工作于'+(Number(data.mode)===1?'三频':'双频')+'模式（BDF '+(data.runtime_bdf||'未知')+'）。';
        ['2g','5g','52g'].forEach(function(key){var b=(data.bands||{})[key]||{},prefix='wifi-'+key;check(prefix+'-enabled',b.enabled?1:0);set(prefix+'-ssid',b.ssid||'');check(prefix+'-hidden',b.hidden?1:0);set(prefix+'-encryption',b.encryption||'none');set(prefix+'-password',b.password||'');set(prefix+'-radius-address',b.radius_address||'');set(prefix+'-radius-port',b.radius_port||1812);set(prefix+'-radius-secret',b.radius_secret||'');set(prefix+'-channel',b.channel||0);set(prefix+'-bandwidth',b.bandwidth||20);if(key==='5g'||key==='52g')normalizeWifiWidth(key);set(prefix+'-power',b.power==null?2:b.power);});
        var common=(data.bands||{})['2g']||{};
        check('wifi-unified',data.unified?1:0);set('wifi-unified-ssid',common.ssid||'');check('wifi-unified-hidden',common.hidden?1:0);set('wifi-unified-encryption',common.encryption||'none');set('wifi-unified-password',common.password||'');set('wifi-unified-radius-address',common.radius_address||'');set('wifi-unified-radius-port',common.radius_port||1812);set('wifi-unified-radius-secret',common.radius_secret||'');
        check('wifi-mlo',data.mlo?1:0);
        check('wifi5-compatible',data.wifi5_compatible?1:0);var selected=Array.isArray(data.wifi5_bands)?data.wifi5_bands.map(Number):[0];[0,1,2].forEach(function(index){check('wifi5-band-'+index,selected.indexOf(index)>=0);});syncWifiOptions();
      }).catch(function(e){notify(e.message,false);});
    }
    bindClick('#wifi-mode-save',function(){var button=this,next=Number(value('wifi-mode'));confirmDialog('切换 Wi-Fi 工作模式','该操作会切换 QCN9224 芯片固件工作模式并立即重启路由器，所有无线连接会暂时中断。确认继续吗？').then(function(ok){if(!ok)return;busy(button,fetch('/cgi-bin/luci/admin/network/be6500_oem_beta/native_wifi_mode',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:next})}).then(jsonResponse).then(function(data){if(!data.ok)throw new Error(data.message||'模式切换失败');return data;}),'模式已保存').then(function(data){if(data&&data.reboot){applyingModal('路由器正在重启；恢复连接后将重新检测芯片驱动模式…');window.setTimeout(function poll(){fetch('/cgi-bin/luci/',{cache:'no-store'}).then(function(r){if(r.ok)window.location.reload();else throw 0;}).catch(function(){window.setTimeout(poll,3000);});},15000);}else load();}).catch(function(){});});});
    id('wifi-mode').addEventListener('change',syncWifiOptions);id('wifi-unified').addEventListener('change',function(){if(!checked('wifi-unified'))splitUnifiedWifiNames();syncWifiOptions();});id('wifi-mlo').addEventListener('change',syncWifiOptions);id('wifi5-compatible').addEventListener('change',syncWifiOptions);['2g','5g','52g'].forEach(function(key){id('wifi-'+key+'-enabled').addEventListener('change',syncWifiOptions);});['wifi-unified','wifi-2g','wifi-5g','wifi-52g'].forEach(function(prefix){id(prefix+'-encryption').addEventListener('change',function(){syncWifiSecurity(prefix);});});['5g','52g'].forEach(function(key){id('wifi-'+key+'-channel').addEventListener('change',function(){normalizeWifiWidth(key);});id('wifi-'+key+'-bandwidth').addEventListener('change',function(){normalizeWifiWidth(key);});});
    bindClick('#wifi-save',function(){var button=this,bands={},unified=checked('wifi-unified');['2g','5g','52g'].forEach(function(key){var prefix='wifi-'+key;bands[key]={enabled:checked(prefix+'-enabled'),ssid:value(prefix+'-ssid'),hidden:checked(prefix+'-hidden'),encryption:value(prefix+'-encryption'),password:value(prefix+'-password'),radius_address:value(prefix+'-radius-address'),radius_port:Number(value(prefix+'-radius-port')),radius_secret:value(prefix+'-radius-secret'),channel:Number(value(prefix+'-channel')),bandwidth:Number(value(prefix+'-bandwidth')),power:Number(value(prefix+'-power'))};if(unified){bands[key].ssid=value('wifi-unified-ssid');bands[key].hidden=checked('wifi-unified-hidden');bands[key].encryption=value('wifi-unified-encryption');bands[key].password=value('wifi-unified-password');bands[key].radius_address=value('wifi-unified-radius-address');bands[key].radius_port=Number(value('wifi-unified-radius-port'));bands[key].radius_secret=value('wifi-unified-radius-secret');}});busy(button,fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({bands:bands,unified:unified,mlo:checked('wifi-mlo'),wifi5_compatible:checked('wifi5-compatible'),wifi5_bands:selectedWifi5Bands()})}).then(jsonResponse).then(function(data){if(!data.ok)throw new Error(data.message||'保存失败');return data;}),'Wi-Fi 设置已保存').catch(function(){});});
    load();
  }
  function validateIPv4(ip) {
    var parts = String(ip || '').split('.');
    return parts.length === 4 && parts.every(function (part) { return /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255; });
  }
  function initPasswordButtons(root) {
    root = root || document;
    var buttons = [];
    if (root.matches && root.matches('[data-password]')) buttons.push(root);
    if (root.querySelectorAll) buttons = buttons.concat([].slice.call(root.querySelectorAll('[data-password]')));
    buttons.forEach(function (button) {
      if (button.classList.contains('cert-password-toggle') || button.getAttribute('data-password-bound') === '1') return;
      button.setAttribute('data-password-bound', '1');
      bindClick(button, function () {
        var field = id(button.getAttribute('data-password'));
        if (field) {
          field.type = field.type === 'password' ? 'text' : 'password';
          var visible = field.type === 'text';
          button.textContent = visible ? '◉' : '*';
          button.setAttribute('aria-pressed', visible ? 'true' : 'false');
          button.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
          button.setAttribute('title', visible ? '隐藏密码' : '显示密码');
        }
      });
    });
  }
  function initToggleImages() {
    /* Switches are rendered with CSS so their active colour follows LuCI. */
  }
  function initNativeSelects() {
    /* All router-setting dropdowns use the browser's native select control. */
  }

  function guestPage() {
    function channelLabel(channel) { channel=Number(channel);var note=channel>14?(channel>=52&&channel<=144?' · DFS，启用需等待约 60 秒':' · 非 DFS'):'';return channel+' ('+(channel===14?2484:channel<=14?2407+channel*5:5000+channel*5)+' MHz)'+note; }
    function bandFields(key,title,channels,widths) {
      return '<div id="guest-band-'+key+'">'+section(title,
        row('启用',toggle('guest-'+key+'-enabled','启用该频段'))+'<div class="guest-band-identity">'+
        row('名称',input('guest-'+key+'-ssid','text','访客 Wi-Fi 名称','maxlength="32"'))+
        row('隐藏网络',toggle('guest-'+key+'-hidden','隐藏 SSID'))+
        wifiSecurityFields('guest-'+key)+'</div>'+
        row('无线信道',select('guest-'+key+'-channel',[['0',key==='2g'?'auto':'auto（可能选择 DFS 信道）']].concat(channels.map(function(c){return[String(c),channelLabel(c)];}))))+
        row('频道宽度',select('guest-'+key+'-bandwidth',widths))+
        row('信号强度',select('guest-'+key+'-power',[['2','穿墙'],['1','标准'],['0','节能']]))+'</div>');
    }
    var widths2=[['20','抗干扰模式 (20/40MHz)'],['40','高性能模式 (40MHz)']];
    var widths5=[['20','抗干扰模式 (20/40MHz)'],['40','高性能模式 (40MHz)'],['80','超高性能模式 (80MHz)'],['160','顶级性能模式 (160/80MHz)']];
    page('访客网络',
      section('访客网络',row('启用',toggle('guest-enabled','启用访客网络'))+
        '<div id="guest-fields">'+row('多频合一',toggle('guest-unified','所有当前频段使用相同名称和密码'))+
        '<div id="guest-unified-fields">'+row('名称',input('guest-unified-ssid','text','访客 Wi-Fi 名称','maxlength="32"'))+
        row('隐藏网络',toggle('guest-unified-hidden','隐藏统一 SSID'))+
        wifiSecurityFields('guest-unified')+'</div></div>')+
      '<div id="guest-network-fields">'+section('网络地址',
        row('IPv4 地址',input('guest-ipv4-address','text','192.168.4.1','maxlength="15"'),'访客网络的网关地址，不能与主 LAN 重叠。')+
        row('子网掩码',select('guest-ipv4-mask',[['255.255.255.0','255.255.255.0'],['255.255.0.0','255.255.0.0'],['255.255.255.128','255.255.255.128']]))+
        row('IPv6',toggle('guest-ipv6-enabled','启用 IPv6 前缀分配'),'从 WAN 获得 IPv6 前缀后，为访客网络提供 RA 和 DHCPv6。'))+'</div>'+
      '<div id="guest-band-fields">'+
      bandFields('2g','2.4GHz',[1,2,3,4,5,6,7,8,9,10,11,12,13],widths2)+
      bandFields('5g','5GHz',[36,40,44,48,52,56,60,64],widths5)+
      bandFields('52g','5.8GHz',[100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165],widths5)+'</div>'+
      buttons(['guest-save','保存访客 Wi-Fi 设置']));
    var endpoint='/cgi-bin/luci/admin/network/be6500_oem_beta/native_wifi?profile=guest', tri=false;
    function normalizeGuestWidth(key){var channel=Number(value('guest-'+key+'-channel')),width=Number(value('guest-'+key+'-bandwidth'));if(width===160&&((key==='52g'&&channel>=149)||(key==='5g'&&channel>64)))set('guest-'+key+'-bandwidth','80');}
    function sync(){var enabled=checked('guest-enabled'),unified=checked('guest-unified');show('#guest-fields',enabled);show('#guest-network-fields',enabled);show('#guest-band-fields',enabled);show('#guest-unified-fields',enabled&&unified);document.querySelectorAll('.guest-band-identity').forEach(function(n){show(n,enabled&&!unified);});show('#guest-band-52g',enabled&&tri);['guest-unified','guest-2g','guest-5g','guest-52g'].forEach(syncWifiSecurity);}
    function setFiveChannels(){var node=id('guest-5g-channel'),old=node&&node.value,list=tri?[36,40,44,48,52,56,60,64]:[36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165];if(node){node.innerHTML='<option value="0">auto（可能选择 DFS 信道）</option>'+list.map(function(c){return'<option value="'+c+'">'+channelLabel(c)+'</option>';}).join('');node.value=list.indexOf(Number(old))>=0?old:'0';}}
    ['guest-enabled','guest-unified'].forEach(function(n){id(n).addEventListener('change',sync);});['guest-unified','guest-2g','guest-5g','guest-52g'].forEach(function(prefix){id(prefix+'-encryption').addEventListener('change',function(){syncWifiSecurity(prefix);});});['5g','52g'].forEach(function(key){id('guest-'+key+'-channel').addEventListener('change',function(){normalizeGuestWidth(key);});id('guest-'+key+'-bandwidth').addEventListener('change',function(){normalizeGuestWidth(key);});});
    bindClick('#guest-save',function(){var button=this,bands={},unified=checked('guest-unified'),global=checked('guest-enabled'),error='',guestIp=value('guest-ipv4-address'),maskPrefix={'255.255.255.0':24,'255.255.0.0':16,'255.255.255.128':25},prefix=maskPrefix[value('guest-ipv4-mask')];['2g','5g','52g'].forEach(function(key){var prefix='guest-'+key;bands[key]={enabled:global&&checked(prefix+'-enabled'),ssid:value(prefix+'-ssid'),hidden:checked(prefix+'-hidden'),encryption:value(prefix+'-encryption'),password:value(prefix+'-password'),radius_address:value(prefix+'-radius-address'),radius_port:Number(value(prefix+'-radius-port')),radius_secret:value(prefix+'-radius-secret'),channel:Number(value(prefix+'-channel')),bandwidth:Number(value(prefix+'-bandwidth')),power:Number(value(prefix+'-power'))};if(unified){bands[key].ssid=value('guest-unified-ssid');bands[key].hidden=checked('guest-unified-hidden');bands[key].encryption=value('guest-unified-encryption');bands[key].password=value('guest-unified-password');bands[key].radius_address=value('guest-unified-radius-address');bands[key].radius_port=Number(value('guest-unified-radius-port'));bands[key].radius_secret=value('guest-unified-radius-secret');}if(key==='52g'&&!tri)bands[key].enabled=false;if(bands[key].enabled&&!bands[key].ssid)error='访客 Wi-Fi 名称不能为空';if(bands[key].enabled&&isPersonalEncryption(bands[key].encryption)&&(bands[key].password.length<8||bands[key].password.length>63))error='Wi-Fi 密码必须为 8–63 位';if(bands[key].enabled&&isEnterpriseEncryption(bands[key].encryption)&&(!bands[key].radius_address||!bands[key].radius_secret||bands[key].radius_port<1||bands[key].radius_port>65535))error='企业级加密需要有效的 RADIUS 地址、端口和密钥';});if(error)return notify(error,false);if(!validateIPv4(guestIp)||!prefix)return notify('请输入正确的访客网络 IPv4 地址和子网掩码',false);busy(button,fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:'guest',guest_network:{ipv4_cidr:guestIp+'/'+prefix,ipv6_enabled:checked('guest-ipv6-enabled')},bands:bands,unified:unified})}).then(jsonResponse).then(function(data){if(!data.ok)throw new Error(data.message||'保存失败');return data;}),'访客 Wi-Fi 设置已保存').then(load).catch(function(){});});
    function load(){fetch(endpoint,{credentials:'same-origin',cache:'no-store'}).then(jsonResponse).then(function(data){tri=Number(data.mode)===1;setFiveChannels();var any=false;['2g','5g','52g'].forEach(function(key){var b=(data.bands||{})[key]||{},prefix='guest-'+key;any=any||!!b.enabled;check(prefix+'-enabled',b.enabled?1:0);set(prefix+'-ssid',b.ssid||'JDCloud-Guest');check(prefix+'-hidden',b.hidden?1:0);set(prefix+'-encryption',b.encryption||'psk2');set(prefix+'-password',b.password||'');set(prefix+'-radius-address',b.radius_address||'');set(prefix+'-radius-port',b.radius_port||1812);set(prefix+'-radius-secret',b.radius_secret||'');set(prefix+'-channel',b.channel||0);set(prefix+'-bandwidth',b.bandwidth||20);if(key==='5g'||key==='52g')normalizeGuestWidth(key);set(prefix+'-power',b.power==null?2:b.power);});var common=(data.bands||{})['2g']||{},network=data.guest_network||{},cidr=String(network.ipv4_cidr||'192.168.4.1/24').split('/'),prefixMask={'16':'255.255.0.0','24':'255.255.255.0','25':'255.255.255.128'};check('guest-enabled',any);set('guest-ipv4-address',cidr[0]||'192.168.4.1');set('guest-ipv4-mask',prefixMask[cidr[1]]||'255.255.255.0');check('guest-ipv6-enabled',network.ipv6_enabled?1:0);check('guest-unified',data.unified?1:0);set('guest-unified-ssid',common.ssid||'JDCloud-Guest');check('guest-unified-hidden',common.hidden?1:0);set('guest-unified-encryption',common.encryption||'psk2');set('guest-unified-password',common.password||'');set('guest-unified-radius-address',common.radius_address||'');set('guest-unified-radius-port',common.radius_port||1812);set('guest-unified-radius-secret',common.radius_secret||'');var title=document.querySelector('#guest-band-5g h3');if(title)title.textContent=tri?'5.2GHz':'5GHz';sync();}).catch(function(e){notify(e.message,false);});}
    initPasswordButtons();load();
  }

  function localPage() {
    page('DHCP 服务',
        row('启用', toggle('dhcp-enabled', '')) +
        '<div id="dhcp-fields">' +
        row('地址池开始', input('dhcp-start', 'number', '100', 'min="1" max="254"')) +
        row('地址池结束', input('dhcp-end', 'number', '249', 'min="1" max="254"')) +
        row('租约时间（分钟）', input('dhcp-lease', 'number', '720', 'min="1"')) +
        row('首选 DNS', input('dhcp-dns1', 'text', '留空自动获取')) +
        row('备用 DNS', input('dhcp-dns2', 'text', '可选')) +
        '</div>' + buttons(['dhcp-save', '保存']) +
      section('局域网 IP 地址',
        row('局域网 IP', input('lan-ip', 'text', '192.168.1.1')) +
        row('子网掩码', select('lan-mask', [['255.255.255.0', '255.255.255.0'], ['255.255.0.0', '255.255.0.0'], ['255.255.255.128', '255.255.255.128']])) +
        buttons(['lan-save', '保存'])))
    ;
    id('dhcp-enabled').addEventListener('change', function () { show('#dhcp-fields', checked('dhcp-enabled')); });
    bindClick('#lan-save', function () {
      if (!validateIPv4(value('lan-ip'))) return notify('请输入正确的 LAN IPv4 地址', false);
      var button = this;
      confirmDialog('应用 LAN 设置', '修改 LAN 地址会暂时中断管理页面连接，确定继续吗？').then(function (confirmed) {
        if (confirmed) busy(button, rpc('set_lan_ip', { ipaddr: value('lan-ip'), netmask: value('lan-mask') }), 'LAN 设置已保存');
      });
    });
    bindClick('#dhcp-save', function () {
      var start = number('dhcp-start'), end = number('dhcp-end');
      if (start < 1 || end > 254 || end < start) return notify('DHCP 地址池范围不正确', false);
      busy(this, rpc('set_lan_dhcp', { enable: checked('dhcp-enabled') ? 1 : 0, start: start, end: end, leasetime: number('dhcp-lease', 720), dns1: value('dhcp-dns1'), dns2: value('dhcp-dns2') }), 'DHCP 设置已即时保存').then(function () { reloadView(); });
    });
    Promise.all([rpc('get_lan_ip', {}), rpc('get_lan_dhcp', {})]).then(function (items) {
      set('lan-ip', items[0].ipaddr); set('lan-mask', items[0].netmask);
      check('dhcp-enabled', items[1].enable); set('dhcp-start', items[1].start); set('dhcp-end', items[1].end);
      set('dhcp-lease', items[1].leasetime); set('dhcp-dns1', items[1].dns1); set('dhcp-dns2', items[1].dns2);
      show('#dhcp-fields', checked('dhcp-enabled'));
    }).catch(function (error) { notify(error.message, false); });
  }

  function internetPage() {
    var wdsNetworks = [];
    var wdsWasEnabled = false;
    page('上网信息',
      '<div id="internet_info" class="native-internet-info">' +
        '<div class="ipv4_info"><div class="ipv4_info_title">IPv4信息</div><div class="ipv4_info_content">' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">连接类型:</span><span class="ipv4_info_item_right" id="wan-info-type">正在读取…</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">IP地址:</span><span class="ipv4_info_item_right" id="wan-info-ip">——</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">子网掩码:</span><span class="ipv4_info_item_right" id="wan-info-mask">——</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">默认网关:</span><span class="ipv4_info_item_right" id="wan-info-gateway">——</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">MTU:</span><span class="ipv4_info_item_right" id="wan-info-mtu">——</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">DNS:</span><span class="ipv4_info_item_right" id="wan-info-dns">——</span></div>' +
          '<div class="ipv4_info_item"><span class="ipv4_info_item_left">连接状态:</span><span class="ipv4_info_item_right" id="wan-info-status">正在检测…</span></div>' +
        '</div></div>' +
        '<div class="ipv6_info"><div class="ipv6_info_title">IPv6信息</div><div class="ipv6_info_content native-ipv6-runtime">' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">IPv6连接类型:</span><span class="ipv6_info_item_right" id="wan6-info-type">正在读取…</span></div>' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">WAN IPv6地址:</span><span class="ipv6_info_item_right" id="wan6-info-ip">——</span></div>' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">WAN IPv6网关:</span><span class="ipv6_info_item_right" id="wan6-info-gateway">——</span></div>' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">LAN IPv6地址:</span><span class="ipv6_info_item_right" id="wan6-info-lan">——</span></div>' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">LAN IPv6前缀:</span><span class="ipv6_info_item_right" id="wan6-info-prefix">——</span></div>' +
          '<div class="ipv6_info_item"><span class="ipv6_info_item_left">IPv6 DNS:</span><span class="ipv6_info_item_right" id="wan6-info-dns">——</span></div>' +
        '</div><div class="ipv6_info_empty native-ipv6-empty">未检测到IPv6信息</div></div>' +
      '</div>' +
      section('上网设置',
        row('上网方式', select('wan-proto', [['dhcp', '自动获取 IP'], ['pppoe', 'PPPoE 拨号'], ['static', '静态 IP'], ['wds', '无线中继']])) +
        '<div id="wan-vlan-fields">' + row('WAN VLAN ID', input('wan-vlan-id', 'number', '留空表示不使用 VLAN', 'min="1" max="4094"')) + '</div>' +
        '<div id="wan-pppoe">' + row('宽带账号', input('wan-user', 'text', '运营商宽带账号')) + row('宽带密码', password('wan-pass', '宽带密码')) + row('MTU', input('wan-mtu', 'number', '1492', 'min="1280" max="1492"')) + '</div>' +
        '<div id="wan-static"><div class="native-grid">' + row('IP 地址', input('wan-ip', 'text', '')) + row('子网掩码', input('wan-mask', 'text', '')) + '</div>' + row('默认网关', input('wan-gateway', 'text', '')) + '</div>' +
        '<div id="wan-wds">' +
          row('选择上级 Wi-Fi', '<div class="native-scan-control">' + select('wan-wds-network', [['', '请扫描上级 Wi-Fi']]) + '<button type="button" class="btn cbi-button cbi-button-add" id="wan-wds-scan">扫描</button></div><p class="native-scan-detail" id="wan-wds-detail">选择网络后会自动识别频段、信号和加密方式</p>') +
          '<div id="wan-wds-hidden-ssid">' + row('隐藏 Wi-Fi 名称', input('wan-wds-ssid', 'text', '请输入真实 SSID', 'maxlength="32"')) + '</div>' +
          row('Wi-Fi 密码', password('wan-wds-key', '请输入上级 Wi-Fi 密码')) +
        '</div>' +
        '<div id="wan-dns-settings">' + row('DNS 获取方式', select('wan-dns-mode', [['auto', '自动获取'], ['custom', '手动配置']])) +
        '<div id="wan-dns-fields" class="native-grid">' + row('首选 DNS', input('wan-dns1', 'text', '请输入首选 DNS')) + row('备用 DNS', input('wan-dns2', 'text', '可选')) + '</div></div>' +
        buttons(['wan-save', '保存'])) +
      section('IPv6 设置',
        row('启用', toggle('ipv6-enabled', '')) +
        '<div id="ipv6-fields">' + row('连接方式', select('ipv6-type', [['native', '自动获取（Native）'], ['relay', '中继'], ['nat6', 'NAT6'], ['static', '静态 IPv6']])) +
        '<div id="ipv6-static"><div class="native-grid">' + row('WAN IPv6 地址', input('ipv6-wan-ip', 'text', '例如 2001:db8::2/64')) + row('IPv6 默认网关', input('ipv6-wan-gateway', 'text', '例如 2001:db8::1')) + '</div><div class="native-grid">' + row('LAN IPv6 前缀', input('ipv6-lan-prefix', 'text', '例如 2001:db8:1::/64')) + row('前缀长度', input('ipv6-prefix-len', 'number', '60', 'min="48" max="64"')) + '</div></div>' +
        row('DNS 获取方式', select('ipv6-dns-mode', [['auto', '自动获取'], ['custom', '手动配置']])) +
        '<div id="ipv6-dns-fields" class="native-grid">' + row('首选 DNS', input('ipv6-dns1', 'text', '请输入首选 IPv6 DNS')) + row('备用 DNS', input('ipv6-dns2', 'text', '可选')) + '</div>' +
        '</div>' + buttons(['ipv6-save', '保存'])))
    ;
    function selectedWds() {
      var selected = value('wan-wds-network');
      for (var i = 0; i < wdsNetworks.length; i += 1) {
        var key = wdsNetworks[i].bssid || (wdsNetworks[i].ssid + '|' + wdsNetworks[i].channel);
        if (key === selected) return wdsNetworks[i];
      }
      return null;
    }
    function syncWds() {
      var network = selectedWds();
      var detail = id('wan-wds-detail');
      var passwordField = id('wan-wds-key');
      var passwordRow = passwordField && passwordField.closest('.native-row');
      var encrypted = network && network.encryption && network.encryption !== 'none' && network.encryption !== 'open' && network.encryption !== 'OPEN/NONE';
      if (passwordRow) passwordRow.style.display = encrypted ? '' : 'none';
      show('#wan-wds-hidden-ssid', !!(network && network.ssid === '隐藏'));
      if (detail) detail.textContent = network ?
        ((Number(network.channel) > 14 ? '5 GHz' : '2.4 GHz') + ' · 信号 ' + (network.rssi == null ? '—' : network.rssi + ' dBm') + ' · ' + (network.encryption || '无加密')) :
        '选择网络后会自动识别频段、信号和加密方式';
    }
    function renderWdsNetworks(items, current) {
      wdsNetworks = Array.isArray(items) ? items : [];
      var field = id('wan-wds-network');
      if (!field) return;
      field.innerHTML = '<option value="">' + (wdsNetworks.length ? '请选择上级 Wi-Fi' : '未扫描到可用 Wi-Fi') + '</option>';
      wdsNetworks.forEach(function (network) {
        var option = document.createElement('option');
        option.value = network.bssid || (network.ssid + '|' + network.channel);
        option.textContent = network.ssid + '  (' + (Number(network.channel) > 14 ? '5G' : '2.4G') + ' / ' + (network.rssi == null ? '—' : network.rssi + ' dBm') + ')';
        field.appendChild(option);
      });
      if (current && current.ssid) {
        var matched = wdsNetworks.filter(function (network) { return network.ssid === current.ssid; })[0];
        if (!matched) {
          matched = { ssid: current.ssid, bssid: 'current|' + current.ssid, channel: current.channel || (Number(current.band) === 1 ? 36 : 1), encryption: current.encryption || 'none', rssi: null };
          wdsNetworks.unshift(matched);
          var currentOption = document.createElement('option');
          currentOption.value = matched.bssid;
          currentOption.textContent = matched.ssid + '  (当前中继网络)';
          field.insertBefore(currentOption, field.options[1] || null);
        }
        field.value = matched.bssid || (matched.ssid + '|' + matched.channel);
      }
      syncWds();
    }
    function scanWds(current) {
      var button = id('wan-wds-scan');
      var old = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = '扫描中…'; button.title = '正在扫描上级 Wi-Fi'; button.setAttribute('aria-busy', 'true'); }
      return rpc('web_get_wifi_scan_list', {}).then(function (result) {
        renderWdsNetworks(result.data || [], current);
        if (!(result.data || []).length) notify('没有扫描到可用的上级 Wi-Fi', false);
      }).catch(function (error) {
        notify(error.message || '扫描上级 Wi-Fi 失败', false);
      }).then(function () {
        if (button) { button.disabled = false; button.textContent = old; button.title = ''; button.removeAttribute('aria-busy'); }
      });
    }
    function syncWan() {
      var proto = value('wan-proto');
      show('#wan-pppoe', proto === 'pppoe');
      show('#wan-static', proto === 'static');
      show('#wan-wds', proto === 'wds');
      show('#wan-vlan-fields', proto !== 'wds');
      show('#wan-dns-settings', proto !== 'wds');
      show(id('wan-dns-mode').closest('.native-row'), proto !== 'wds' && proto !== 'static');
      show('#wan-dns-fields', proto !== 'wds' && (proto === 'static' || value('wan-dns-mode') === 'custom'));
      if (proto === 'wds') syncWds();
    }
    function sync6() {
      show('#ipv6-fields', checked('ipv6-enabled'));
      show('#ipv6-static', checked('ipv6-enabled') && value('ipv6-type') === 'static');
      show('#ipv6-dns-fields', checked('ipv6-enabled') && value('ipv6-dns-mode') === 'custom');
    }
    id('wan-proto').addEventListener('change', function () {
      if (value('wan-proto') === 'pppoe') set('wan-mtu', '1492');
      syncWan();
      if (value('wan-proto') === 'wds' && !wdsNetworks.length) scanWds();
    });
    id('wan-dns-mode').addEventListener('change', syncWan);
    id('ipv6-enabled').addEventListener('change', sync6); id('ipv6-type').addEventListener('change', sync6); id('ipv6-dns-mode').addEventListener('change', sync6);
    id('wan-wds-network').addEventListener('change', syncWds);
    bindClick('#wan-wds-scan', function () { scanWds(); });
    bindClick('#wan-save', function () {
      var proto = value('wan-proto'), button = this;
      if (proto === 'wds') {
        var network = selectedWds();
        if (!network) return notify('请先扫描并选择一个上级 Wi-Fi', false);
        var targetSsid = network.ssid === '隐藏' ? value('wan-wds-ssid') : network.ssid;
        if (!targetSsid) return notify('请输入隐藏 Wi-Fi 的真实名称', false);
        var encrypted = network.encryption && network.encryption !== 'none' && network.encryption !== 'open' && network.encryption !== 'OPEN/NONE';
        if (encrypted && (value('wan-wds-key').length < 8 || value('wan-wds-key').length > 63)) return notify('上级 Wi-Fi 密码必须为 8–63 位', false);
        busy(button, rpc('web_set_wds_config', { enable: 1, ssid: targetSsid, bssid: network.bssid || '', encryption: network.encryption || 'none', key: encrypted ? value('wan-wds-key') : '', channel: Number(network.channel) || 0 }), '无线中继已保存，正在连接上级 Wi-Fi').then(function () { reloadView(2500); });
        return;
      }
      var method = proto === 'pppoe' ? 'set_wan_pppoe' : proto === 'static' ? 'set_wan_static' : 'set_wan_dhcp';
      if (proto === 'pppoe' && !value('wan-user')) return notify('宽带账号不能为空', false);
      if (proto === 'static' && (!validateIPv4(value('wan-ip')) || !validateIPv4(value('wan-mask')) || !validateIPv4(value('wan-gateway')))) return notify('静态 IP 参数不正确', false);
      var customDns = proto === 'static' || value('wan-dns-mode') === 'custom';
      if (customDns && !validateIPv4(value('wan-dns1'))) return notify('手动配置时首选 DNS 不能为空且必须是正确的 IPv4 地址', false);
      if (customDns && value('wan-dns2') && !validateIPv4(value('wan-dns2'))) return notify('备用 DNS 格式不正确', false);
      if (value('wan-vlan-id') && (number('wan-vlan-id') < 1 || number('wan-vlan-id') > 4094)) return notify('WAN VLAN ID 必须为 1–4094，或留空关闭 VLAN', false);
      busy(button, rpc(method, { username: value('wan-user'), password: value('wan-pass'), mtu: number('wan-mtu', 1492), ipaddr: value('wan-ip'), netmask: value('wan-mask'), gateway: value('wan-gateway'), dns_enabled: customDns ? 1 : 0, dns1: customDns ? value('wan-dns1') : '', dns2: customDns ? value('wan-dns2') : '', vlan_id: value('wan-vlan-id') }), '上网配置已保存，WAN 正在重新连接').then(function () { reloadView(1200); });
    });
    bindClick('#ipv6-save', function () {
      var method = 'web_set_ipv6_' + value('ipv6-type');
      var customDns = checked('ipv6-enabled') && value('ipv6-dns-mode') === 'custom';
      if (customDns && !value('ipv6-dns1')) return notify('手动配置时首选 IPv6 DNS 不能为空', false);
      busy(this, rpc(method, { enabled: checked('ipv6-enabled') ? 1 : 0, fw_enable: 1, dns_enabled: customDns ? 1 : 0, dns1: customDns ? value('ipv6-dns1') : '', dns2: customDns ? value('ipv6-dns2') : '', wan_ipaddr: value('ipv6-wan-ip'), wan_gateway: value('ipv6-wan-gateway'), lan_prefix: value('ipv6-lan-prefix'), lan_prefix_len: number('ipv6-prefix-len', 60) }), 'IPv6 设置已保存').then(function () { reloadView(700); });
    });
    initPasswordButtons();
    function displayValue(value) { return value == null || value === '' ? '——' : String(value); }
    function firstValue(source, keys) {
      for (var i = 0; i < keys.length; i += 1) if (source && source[keys[i]] != null && source[keys[i]] !== '') return source[keys[i]];
      return '';
    }
    function writeRuntime(name, value) { var node = id(name); if (node) node.textContent = displayValue(value); }
    Promise.all([rpc('get_wan_info', {}), rpc('web_get_wds_config', {}).catch(function () { return {}; })]).then(function (items) {
      var wan = items[0], wds = items[1] || {};
      wdsWasEnabled = Number(wds.enable != null ? wds.enable : wds.enabled) === 1;
      set('wan-proto', wdsWasEnabled ? 'wds' : wan.proto); set('wan-vlan-id', wan.vlan_mode === 'tagged' && wan.vlan_id ? wan.vlan_id : ''); set('wan-user', wan.username); set('wan-pass', wan.password); set('wan-mtu', wan.proto === 'pppoe' ? Math.min(Number(wan.mtu) || 1492, 1492) : wan.mtu);
      set('wan-ip', wan.config_ipaddr != null ? wan.config_ipaddr : wan.ipaddr); set('wan-mask', wan.config_netmask != null ? wan.config_netmask : wan.netmask); set('wan-gateway', wan.config_gateway != null ? wan.config_gateway : wan.gateway); set('wan-dns-mode', Number(wan.dns_enabled) === 1 ? 'custom' : 'auto'); set('wan-dns1', wan.dns1); set('wan-dns2', wan.dns2);
      set('wan-wds-key', wds.key || '');
      writeRuntime('wan-info-type', ({ pppoe: '宽带拨号上网', dhcp: '动态 IP 上网', static: '静态 IP 上网', wds: '无线中继' })[wdsWasEnabled ? 'wds' : wan.proto] || wan.proto);
      writeRuntime('wan-info-ip', firstValue(wan, ['ipaddr', 'ip', 'address']));
      writeRuntime('wan-info-mask', firstValue(wan, ['netmask', 'mask']));
      writeRuntime('wan-info-gateway', firstValue(wan, ['gateway', 'gw']));
      writeRuntime('wan-info-mtu', firstValue(wan, ['mtu']));
      writeRuntime('wan-info-dns', [wan.runtime_dns1, wan.runtime_dns2].filter(Boolean).join(' / ') || [wan.dns1, wan.dns2].filter(Boolean).join(' / '));
      writeRuntime('wan-info-status', Number(wan.up || wan.connected || wan.status === 'up') ? '已连接' : (wan.ipaddr ? '已连接' : '未连接'));
      syncWan();
      if (wdsWasEnabled) scanWds(wds);
    }).catch(function (error) {
      writeRuntime('wan-info-type', '读取失败'); writeRuntime('wan-info-status', error.message || '接口调用失败');
    });
    rpc('web_get_ipv6_config', {}).then(function (six) {
      check('ipv6-enabled', six.enabled); set('ipv6-type', six.type); set('ipv6-dns-mode', Number(six.dns_enabled) === 1 ? 'custom' : 'auto'); set('ipv6-dns1', six.dns1); set('ipv6-dns2', six.dns2); set('ipv6-wan-ip', six.wan_ipaddr); set('ipv6-wan-gateway', six.wan_gateway); set('ipv6-lan-prefix', six.lan_prefix); set('ipv6-prefix-len', six.prefix_len || 60);
      writeRuntime('wan6-info-type', ({ native: '自动获取', relay: 'IPv6 中继', nat6: 'NAT6', static: '静态 IPv6' })[six.type] || six.type);
      sync6();
    }).catch(function () { writeRuntime('wan6-info-type', '未启用'); });
    rpc('get_wan6_info', {}).then(function (runtime) {
      var address = firstValue(runtime, ['ipaddr', 'address', 'wan_ipaddr', 'ipv6']);
      var content = document.querySelector('.native-ipv6-runtime'), empty = document.querySelector('.native-ipv6-empty');
      if (content) content.style.display = address ? 'block' : 'none';
      if (empty) empty.style.display = address ? 'none' : 'flex';
      writeRuntime('wan6-info-ip', address);
      writeRuntime('wan6-info-gateway', firstValue(runtime, ['gateway', 'gw', 'wan_gateway']));
      writeRuntime('wan6-info-lan', firstValue(runtime, ['lan_ipaddr', 'lan_address', 'lan_ipv6']));
      writeRuntime('wan6-info-prefix', firstValue(runtime, ['prefix', 'lan_prefix', 'delegated_prefix']));
      var dns6 = firstValue(runtime, ['dns', 'dns_servers']);
      writeRuntime('wan6-info-dns', Array.isArray(dns6) ? dns6.join(' / ') : dns6);
    }).catch(function () {
      var content = document.querySelector('.native-ipv6-runtime'), empty = document.querySelector('.native-ipv6-empty');
      if (content) content.style.display = 'none'; if (empty) empty.style.display = 'flex';
    });
  }

  function iptvPage() {
    page('IPTV 设置', '<div class="native-settings-grid">' +
      '<section class="native-settings-panel"><h2>IPTV 与 VLAN</h2>' +
      row('开启 IPTV', toggle('iptv-enabled', '')) +
      '<div id="iptv-fields">' +
      row('IPTV 接入方式', select('iptv-access-mode', [['vlan', 'WAN VLAN 接入'], ['lan', 'LAN 口接光猫 IPTV 口']])) +
      '<div id="iptv-vlan-row">' + row('IPTV VLAN ID', input('iptv-vlan-id', 'number', '4000', 'min="1" max="4094"')) + '</div>' +
      '<div id="iptv-source-row">' + row('IPTV 上联 LAN 口', select('iptv-source-port', [['lan1', 'LAN1'], ['lan2', 'LAN2'], ['lan3', 'LAN3']])) + '</div>' +
      row('机顶盒端口绑定', select('iptv-stb-port', [['none', '不绑定（使用转播）'], ['lan1', 'LAN1'], ['lan2', 'LAN2'], ['lan3', 'LAN3']])) +
      '<p class="native-info">WAN VLAN 模式从连接光猫的 WAN 口获取服务；LAN 口模式用于连接光猫独立的 IPTV 口。只有实体机顶盒需要原始信号时才绑定输出 LAN 口。</p></div></section>' +
      '<section class="native-settings-panel"><h2>udpxy 组播转播</h2>' +
      row('开启转播', toggle('iptv-udpxy-enabled', '')) +
      row('监听端口', input('iptv-udpxy-port', 'number', '4022', 'min="1" max="65535"')) +
      row('转播地址', '<span id="iptv-relay-url" class="native-value">—</span>') +
      '<p id="iptv-udpxy-note" class="native-info">保存时自动建立 IPTV 接口、组播路由和防火墙规则。</p>' +
      '<div id="iptv-runtime" class="native-status">正在读取 IPTV 接口状态…</div></section>' +
      '</div>' +
      '<section class="native-settings-panel native-settings-wide"><h2>机顶盒 DHCP 鉴权</h2>' +
      row('身份模拟', toggle('iptv-auth-enabled', '启用机顶盒身份模拟')) +
      '<div id="iptv-auth-fields"><div class="native-auth-grid">' +
      row('机顶盒 MAC 地址', input('iptv-auth-mac', 'text', 'AA:BB:CC:DD:EE:FF', 'maxlength="17"')) +
      row('Option 12（主机名）', input('iptv-option12', 'text', '', 'maxlength="255"')) +
      row('Option 60', input('iptv-option60', 'text', '二进制十六进制字节', 'maxlength="510"')) +
      row('自动抓取', '<div class="native-inline-control">' + select('iptv-capture-port', [['lan1', 'LAN1'], ['lan2', 'LAN2'], ['lan3', 'LAN3']]) + '<button type="button" class="btn cbi-button cbi-button-neutral" id="iptv-capture">自动抓取</button></div>') +
      '</div><p class="native-info">把机顶盒接到所选 LAN 口，点击“自动抓取”后立即重启机顶盒。若 Option 60 每次抓取都不同，说明运营商使用动态鉴权，静态值不能替代机顶盒。</p></div></section>' +
      '<p class="native-warning">更改 IPTV 接入方式、VLAN 或端口绑定会让对应网络接口短暂重载，但不会重启路由器。</p>' + buttons(['iptv-save', '保存 IPTV 设置']));
    function sync() {
      show('#iptv-fields', checked('iptv-enabled'));
      show('#iptv-vlan-row', value('iptv-access-mode') === 'vlan');
      show('#iptv-source-row', value('iptv-access-mode') === 'lan');
      show('#iptv-auth-fields', checked('iptv-auth-enabled'));
      var port = number('iptv-udpxy-port', 4022) || 4022;
      if (id('iptv-relay-url')) id('iptv-relay-url').textContent = 'http://' + (state.iptvRelayHost || location.hostname) + ':' + port + '/udp/组播地址';
    }
    ['iptv-enabled', 'iptv-access-mode', 'iptv-auth-enabled', 'iptv-udpxy-port'].forEach(function (name) { id(name).addEventListener('change', sync); id(name).addEventListener('input', sync); });
    bindClick('#iptv-save', function () {
      if (checked('iptv-enabled') && value('iptv-access-mode') === 'vlan' && (number('iptv-vlan-id') < 1 || number('iptv-vlan-id') > 4094)) return notify('IPTV VLAN ID 必须为 1–4094', false);
      if (checked('iptv-auth-enabled') && !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(value('iptv-auth-mac'))) return notify('机顶盒 MAC 地址格式不正确', false);
      busy(this, rpc('set_iptv_info', {
        enable: checked('iptv-enabled') ? 1 : 0, access_mode: value('iptv-access-mode'), vlan_id: number('iptv-vlan-id'),
        source_port: value('iptv-source-port'), stb_port: value('iptv-stb-port'), udpxy_enable: checked('iptv-udpxy-enabled') ? 1 : 0,
        udpxy_port: number('iptv-udpxy-port', 4022), auth_enable: checked('iptv-auth-enabled') ? 1 : 0,
        auth_mac: value('iptv-auth-mac'), option12: value('iptv-option12'), option60: value('iptv-option60'), capture_port: value('iptv-capture-port')
      }), 'IPTV 设置已保存').then(function () { return rpc('get_iptv_info', {}); }).then(render);
    });
    bindClick('#iptv-capture', function () {
      var button = this; button.disabled = true; button.textContent = '正在监听 DHCP…';
      rpc('capture_iptv_dhcp', { port: value('iptv-capture-port') }).then(function (result) {
        set('iptv-auth-mac', result.mac); set('iptv-option12', result.option12); set('iptv-option60', result.option60); notify('机顶盒 DHCP 参数已抓取', true);
      }).catch(function (error) { notify(error.message || '抓取失败', false); }).then(function () { button.disabled = false; button.textContent = '自动抓取'; });
    });
    function render(result) {
      check('iptv-enabled', result.enable); set('iptv-access-mode', result.access_mode || 'vlan'); set('iptv-vlan-id', result.vlan_id || 4000);
      set('iptv-source-port', result.source_port || 'lan1'); set('iptv-stb-port', result.stb_port || 'none');
      check('iptv-udpxy-enabled', result.udpxy_enable); set('iptv-udpxy-port', result.udpxy_port || 4022);
      check('iptv-auth-enabled', result.auth_enable); set('iptv-auth-mac', result.auth_mac); set('iptv-option12', result.option12); set('iptv-option60', result.option60); set('iptv-capture-port', result.capture_port || 'lan1');
      state.iptvRelayHost = ((result.relay_url || '').match(/^https?:\/\/([^:/]+)/) || [])[1] || location.hostname;
      if (id('iptv-runtime')) id('iptv-runtime').innerHTML = '<b>IPTV 接口：</b>' + esc(result.ifname || '尚未创建') + '<br><b>接口状态：</b>' + (Number(result.enable) ? (Number(result.up) ? '已连接' : '已启用，等待链路') : '已停用') + '<br><b>udpxy：</b>' + (Number(result.udpxy_installed) ? (Number(result.udpxy_enable) ? '已开启' : '已停用') : '组件尚未安装');
      if (!Number(result.udpxy_installed)) id('iptv-udpxy-note').textContent = '当前固件尚未安装 udpxy 组件；设置会保留，安装组件后即可启用转播。';
      sync();
    }
    rpc('get_iptv_info', {}).then(render).catch(function (error) { notify(error.message, false); });
  }

  function deviceRow(device, index) {
    var mac = device.uid || device.id || device.mac || '';
    var online = Number(device.online);
    var connection = device.type === 'wire' ? '有线连接' :
      (String(device.ssid || '未知 SSID') + ' · ' + String(device.band || '未知频段'));
    function formatRate(bytes) {
      bytes = Number(bytes) || 0;
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(bytes >= 10485760 ? 1 : 2) + ' MB/s';
      if (bytes >= 1024) return (bytes / 1024).toFixed(bytes >= 10240 ? 1 : 2) + ' KB/s';
      return Math.round(bytes) + ' B/s';
    }
    var upload = formatRate(device.upload_speed != null ? device.upload_speed : (device.uplink || device.up_speed || device.tx_rate || 0));
    var download = formatRate(device.download_speed != null ? device.download_speed : (device.downlink || device.down_speed || device.rx_rate || 0));
    var deviceType = device.device_type || '其他设备';
    var vendor = device.vendor || device.brand || '暂未识别';
    return '<ul class="native-table-row data" data-index="' + index + '">' +
      '<li class="name col-device-name"><b>' + esc(deviceDisplayName(device.name, device.uid || device.mac)) + '</b></li>' +
      '<li class="col-device-address"><code>' + esc(mac) + '</code><small>' + esc(device.ip || '未分配 IP') + '</small></li>' +
      '<li class="col-device-type" title="' + esc(deviceType) + '">' + esc(deviceType) + '</li>' +
      '<li class="col-device-vendor" title="' + esc(vendor) + '">' + esc(vendor) + '</li>' +
      '<li class="col-device-status"><i class="status-dot ' + (online ? 'online' : 'offline') + '"></i>' + (online ? '在线' : '离线') + '<small>' + esc(connection) + '</small></li>' +
      '<li class="col-device-speed"><span>↑ ' + esc(upload) + '</span><small>↓ ' + esc(download) + '</small></li>' +
      '<li class="col-device-actions"><button type="button" class="edit device-edit">编辑</button></li></ul>';
  }
  function devicesPage() {
    page('设备列表',
      '<div class="native-device-group"><h3>在线设备</h3><div class="native-table native-device-table"><ul class="native-table-head"><li class="col-device-name">设备名称</li><li class="col-device-address">MAC/IP</li><li class="col-device-type">设备类型</li><li class="col-device-vendor">品牌 / 厂商</li><li class="col-device-status">状态</li><li class="col-device-speed">实时速度</li><li class="col-device-actions">操作</li></ul><div id="device-online"><div class="native-empty">正在读取设备…</div></div></div></div>' +
      '<div class="native-device-group"><h3>离线设备</h3><div class="native-table native-device-table"><ul class="native-table-head"><li class="col-device-name">设备名称</li><li class="col-device-address">MAC/IP</li><li class="col-device-type">设备类型</li><li class="col-device-vendor">品牌 / 厂商</li><li class="col-device-status">状态</li><li class="col-device-speed">实时速度</li><li class="col-device-actions">操作</li></ul><div id="device-offline"><div class="native-empty">正在读取设备…</div></div></div></div>');
    var editing = null;
    var deviceLoading = false;
    var deviceModalOpen = false;
    function setNetworkAccess(device, allowed) {
      var mac = device.uid || device.id || device.mac;
      return rpc('get_macfilter_info', {}).then(function (access) {
        var policy = access.macpolicy === 'allow' ? 'allow' : 'deny';
        var entries = asArray(policy === 'allow' ? access.whitelist : access.blacklist);
        var present = entries.some(function (item) { return String(item.mac || item.macaddr || '').toUpperCase() === String(mac).toUpperCase(); });
        var wanted = policy === 'allow' ? allowed : !allowed;
        if (present === wanted && (allowed || Number(access.enable))) return null;
        return rpc('set_macfilter', {
          enable: (!allowed || Number(access.enable)) ? 1 : 0,
          macpolicy: policy,
          list: [{ name: device.name || '未知设备', macaddr: mac, mod: wanted ? 1 : 0 }]
        });
      });
    }
    function openDeviceEditor(device) {
      var host = window.parent && window.parent !== window ? window.parent : window;
      if (!(host.L && typeof host.L.require === 'function')) return notify('系统原生弹窗组件不可用', false);
      deviceModalOpen = true;
      host.L.require('ui').then(function (ui) {
        var doc = host.document;
        var form = doc.createElement('div');
        form.className = 'cbi-map';
        form.innerHTML =
          '<div class="cbi-section"><div class="cbi-value"><label class="cbi-value-title">设备名称</label><div class="cbi-value-field"><input class="cbi-input-text" data-field="name" maxlength="63"></div></div>' +
          '<div class="cbi-value"><label class="cbi-value-title">允许联网</label><div class="cbi-value-field"><input class="cbi-input-checkbox" data-field="network" type="checkbox"></div></div>' +
          '<div class="cbi-value"><label class="cbi-value-title">启用限速</label><div class="cbi-value-field"><input class="cbi-input-checkbox" data-field="qos" type="checkbox"></div></div>' +
          '<div data-field="speed"><div class="cbi-value"><label class="cbi-value-title">上传速度</label><div class="cbi-value-field"><div class="control-group"><input class="cbi-input-text" data-field="up" type="number" min="0" step="0.1"><span>Mbps</span></div></div></div>' +
          '<div class="cbi-value"><label class="cbi-value-title">下载速度</label><div class="cbi-value-field"><div class="control-group"><input class="cbi-input-text" data-field="down" type="number" min="0" step="0.1"><span>Mbps</span></div></div></div></div></div>';
        var name = form.querySelector('[data-field="name"]');
        var network = form.querySelector('[data-field="network"]');
        var qos = form.querySelector('[data-field="qos"]');
        var speed = form.querySelector('[data-field="speed"]');
        var up = form.querySelector('[data-field="up"]');
        var down = form.querySelector('[data-field="down"]');
        name.value = device.name || '';
        network.checked = device.network_enable == null ? true : !!Number(device.network_enable);
        qos.checked = !!Number(device.qos_enable);
        up.value = Number(device.qos_upload) || 0;
        down.value = Number(device.qos_download) || 0;
        function syncSpeed() { speed.style.display = qos.checked ? '' : 'none'; }
        qos.addEventListener('change', syncSpeed); syncSpeed();

        var footer = doc.createElement('div');
        footer.className = 'right';
        var cancel = doc.createElement('button');
        cancel.type = 'button'; cancel.className = 'btn cbi-button cbi-button-neutral'; cancel.textContent = '取消';
        var save = doc.createElement('button');
        save.type = 'button'; save.className = 'btn cbi-button cbi-button-positive important'; save.textContent = '保存并应用';
        footer.appendChild(cancel); footer.appendChild(save);
        cancel.addEventListener('click', function () { deviceModalOpen = false; ui.hideModal(); });
        save.addEventListener('click', function () {
          var mac = device.uid || device.id || device.mac;
          busy(save, Promise.all([
            rpc('web_set_station_name', { uid: mac, name: name.value.trim(), manual: name.value.trim() !== (device.name || '') ? 1 : 0 }),
            rpc('web_set_device_limit_speed', { uid: mac, enable: qos.checked ? 1 : 0, upload: Number(up.value) || 0, download: Number(down.value) || 0 }),
            setNetworkAccess(device, network.checked)
          ]), '设备设置已保存').then(function () { deviceModalOpen = false; return load(); });
        });
        ui.showModal('设备信息', [form, footer]);
      }).catch(function (error) { deviceModalOpen = false; notify(error.message || '无法打开设备设置', false); });
    }
    function load() {
      if (deviceLoading || deviceModalOpen) return Promise.resolve();
      deviceLoading = true;
      return rpc('web_get_device_list', {}).then(function (result) {
        state.devices = asArray(result.device_list);
        var online = [], offline = [];
        state.devices.forEach(function (device, index) { (Number(device.online) ? online : offline).push(deviceRow(device, index)); });
        id('device-online').innerHTML = online.length ? online.join('') : '<div class="native-empty">暂无在线设备</div>';
        id('device-offline').innerHTML = offline.length ? offline.join('') : '<div class="native-empty">暂无离线设备</div>';
        document.querySelectorAll('.device-edit').forEach(function (button) {
          bindClick(button, function () {
            editing = state.devices[Number(button.closest('[data-index]').getAttribute('data-index'))];
            openDeviceEditor(editing);
          });
        });
        if (window.parent && window.parent.setHeight) window.parent.setHeight(document.body.scrollHeight + 40, 850);
      }).catch(function (error) { notify(error.message, false); }).then(function () { deviceLoading = false; });
    }
    load();
    window.__nativeDeviceTimer = setInterval(load, 2000);
  }

  function accessPage() {
    page('访问控制',
      '<div class="native-access-mode"><div class="native-access-label">模式</div><div class="native-access-options">' +
      '<button type="button" id="access-deny" data-policy="deny"><i></i><span>黑名单模式（不允许列表中设备访问）</span></button>' +
      '<button type="button" id="access-allow" data-policy="allow"><i></i><span>白名单模式（只允许列表中设备访问）</span></button></div>' +
      '<select id="access-policy" class="native-hidden"><option value="deny">deny</option><option value="allow">allow</option></select></div>' +
      row('启用', toggle('access-enabled', '')) +
      '<div class="native-info">添加、移除、启停及名单模式切换会暂存；保存后会即时同步到运行中的 Wi-Fi，不会重启 Wi-Fi。</div>' +
      '<section class="native-access-list"><h3 id="access-list-title">黑名单设备列表</h3><div class="native-table native-access-table"><ul class="native-table-head"><li class="access-name">设备名称</li><li class="access-address">MAC</li><li class="access-type">设备类型</li><li class="access-vendor">品牌 / 厂商</li><li class="access-action">操作</li></ul><div id="access-list"><div class="native-empty">正在读取名单…</div></div></div>' +
      '<div class="native-access-actions"><button type="button" id="access-manual-open">手动添加</button><button type="button" id="access-device-open">选择设备添加</button></div></section>' +
      buttons(['access-mode-save', '保存并应用']) +
      '<div class="native-modal-mask"></div><div class="modal cbi-modal native-modal" id="access-modal"><div class="native-modal-head"><h4 id="access-modal-title">手动添加</h4><button type="button" class="btn cbi-button cbi-button-neutral native-modal-close" aria-label="关闭">×</button></div><div class="native-modal-body">' +
      '<div id="access-device-row">' + row('选择设备', '<select id="access-device" class="native-plain-select"><option value="">-- 请选择 --</option></select>') + '</div>' +
      row('设备名', input('access-name', 'text', '请输入设备名')) + row('MAC 地址', input('access-mac', 'text', 'AA:BB:CC:DD:EE:FF')) + buttons(['access-add', '加入待保存名单']) + '</div></div>')
    ;
    var draft = { deny: [], allow: [] };
    var dirty = false;
    function activeList() { return draft[value('access-policy') === 'allow' ? 'allow' : 'deny']; }
    function deviceFor(mac) {
      mac = normalizeMac(mac);
      return state.devices.filter(function (device) { return normalizeMac(device.uid || device.id || device.mac) === mac; })[0] || {};
    }
    function syncMode() {
      var policy = value('access-policy');
      id('access-deny').classList.toggle('active', policy === 'deny'); id('access-allow').classList.toggle('active', policy === 'allow');
      id('access-list-title').textContent = policy === 'allow' ? '白名单设备列表' : '黑名单设备列表';
    }
    function refreshDeviceOptions() {
      var policy = value('access-policy') === 'allow' ? 'allow' : 'deny';
      var listed = {};
      activeList().forEach(function (item) { listed[normalizeMac(item.mac || item.macaddr)] = true; });
      var candidates = {}, order = [];
      state.devices.forEach(function (device) {
        var mac = normalizeMac(device.uid || device.id || device.mac);
        // The access list controls Wi-Fi only.  DHCP/ARP history is not proof
        // of a wired connection, and wired clients are not valid ACL targets.
        if (String(device.type || '').indexOf('Wi-Fi') < 0) return;
        if (!mac || listed[mac] || candidates[mac]) return;
        candidates[mac] = { mac: mac, name: device.name || '', rejected_at: '' };
        order.push(mac);
      });
      if (policy === 'allow') asArray(state.rejected).forEach(function (device) {
        var mac = normalizeMac(device.mac || device.uid);
        if (!mac || listed[mac]) return;
        if (!candidates[mac]) {
          candidates[mac] = { mac: mac, name: rejectedWifiName(device.name, mac), rejected_at: device.rejected_at || '' };
          order.push(mac);
        } else if (device.rejected_at) {
          candidates[mac].rejected_at = device.rejected_at;
          if (!candidates[mac].name || /^有线设备-[0-9a-f]{4}$/i.test(candidates[mac].name))
            candidates[mac].name = rejectedWifiName(device.name, mac);
        }
      });
      id('access-device').innerHTML = '<option value="">-- 请选择 --</option>' + order.map(function (mac) {
        var device = candidates[mac];
        var rejected = device.rejected_at ? '（最后拒绝：' + device.rejected_at + '）' : '';
        return '<option value="' + esc(mac) + '" data-name="' + esc(device.name) + '">' +
          esc(deviceDisplayName(device.name, mac)) + '（' + esc(mac) + '）' + esc(rejected) + '</option>';
      }).join('');
    }
    function modal(open, connected) {
      document.querySelector('.native-modal-mask').classList.toggle('open', open); id('access-modal').classList.toggle('open', open);
      if (open) { id('access-modal-title').textContent = connected ? '选择设备添加' : '手动添加'; show('#access-device-row', connected); if (connected) refreshDeviceOptions(); else { set('access-name', ''); set('access-mac', ''); } }
    }
    function render() {
      var list = activeList();
      id('access-list').innerHTML = list.length ? list.map(function (item) {
        var device = deviceFor(item.mac || item.macaddr);
        return '<ul class="native-table-row"><li class="access-name"><b>' + esc(deviceDisplayName(item.name || device.name, item.mac || item.macaddr)) + '</b></li><li class="access-address"><code>' + esc(item.mac || item.macaddr) + '</code></li><li class="access-type">' + esc(device.device_type || item.device_type || '其他设备') + '</li><li class="access-vendor">' + esc(device.vendor || device.brand || item.vendor || item.brand || '暂未识别') + '</li><li class="access-action"><button class="edit access-remove" data-mac="' + esc(item.mac || item.macaddr) + '">移除</button></li></ul>';
      }).join('') : '<div class="native-empty">当前名单为空</div>';
      syncMode();
      refreshDeviceOptions();
      document.querySelectorAll('.access-remove').forEach(function (button) {
        bindClick(button, function () {
          var mac = normalizeMac(button.dataset.mac);
          var policy = value('access-policy') === 'allow' ? 'allow' : 'deny';
          draft[policy] = draft[policy].filter(function (item) { return normalizeMac(item.mac || item.macaddr) !== mac; });
          dirty = true; render();
        });
      });
    }
    function load() {
      return Promise.all([rpc('get_macfilter_info', {}), rpc('web_get_device_list', {}), rpc('web_get_rejected_list', {})]).then(function (items) {
        state.access = items[0]; state.devices = asArray(items[1].device_list);
        state.rejected = asArray(items[2].data || items[2].rejected_list);
        draft.deny = asArray(state.access.blacklist).map(function (item) { return Object.assign({}, item); });
        draft.allow = asArray(state.access.whitelist).map(function (item) { return Object.assign({}, item); });
        dirty = false;
        set('access-policy', state.access.macpolicy || 'deny'); check('access-enabled', state.access.enable);
        render();
      }).catch(function (error) { notify(error.message, false); });
    }
    document.querySelectorAll('[data-policy]').forEach(function (button) { bindClick(button, function () { set('access-policy', button.getAttribute('data-policy')); dirty = true; render(); }); });
    id('access-policy').addEventListener('change', render);
    id('access-enabled').addEventListener('change', function () { dirty = true; });
    id('access-device').addEventListener('change', function () { var option = this.options[this.selectedIndex]; set('access-mac', this.value); set('access-name', option ? option.dataset.name : ''); });
    bindClick('#access-manual-open', function () { modal(true, false); }); bindClick('#access-device-open', function () { modal(true, true); });
    bindClick('.native-modal-close', function () { modal(false); }); bindClick('.native-modal-mask', function () { modal(false); });
    bindClick('#access-mode-save', function () {
      var enabled = checked('access-enabled');
      var policy = value('access-policy') === 'allow' ? 'allow' : 'deny';
      var clientMac = normalizeMac(state.access.client_mac);
      var clientAllowed = draft.allow.some(function (item) { return normalizeMac(item.mac || item.macaddr) === clientMac; });
      var clientDenied = draft.deny.some(function (item) { return normalizeMac(item.mac || item.macaddr) === clientMac; });
      var rejectsClient = policy === 'allow' ? !clientAllowed : clientDenied;
      if (enabled && Number(state.access.client_wireless) && clientMac && rejectsClient &&
          !window.confirm('当前管理设备（' + clientMac + '）' + (policy === 'allow' ? '不在白名单中' : '已在黑名单中') + '。保存后本机会被 Wi-Fi 拒绝并断开连接，确定继续吗？')) return;
      var button = this;
      busy(button, rpc('set_macfilter', {
        enable: enabled ? 1 : 0, macpolicy: policy, replace: 1,
        blacklist: draft.deny, whitelist: draft.allow, list: []
      }), '已保存并即时生效，Wi-Fi 未重启').then(function () { dirty = false; return load(); });
    });
    bindClick('#access-add', function () {
      if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(value('access-mac'))) return notify('MAC 地址格式不正确', false);
      var policy = value('access-policy') === 'allow' ? 'allow' : 'deny';
      var mac = normalizeMac(value('access-mac'));
      var existing = draft[policy].filter(function (item) { return normalizeMac(item.mac || item.macaddr) === mac; })[0];
      if (existing) existing.name = value('access-name') || existing.name || '未知设备';
      else draft[policy].push({ name: value('access-name') || '未知设备', mac: mac });
      dirty = true; modal(false); render();
    });
    load();
  }

  function rejectedPage() {
    page('拒绝记录',
      '<div class="native-inline-actions native-rejected-actions"><button type="button" id="rejected-refresh">刷新记录</button><button type="button" id="rejected-clear-all">清除全部</button></div>' +
      '<div class="native-info">这里只记录被访问控制实际拒绝的认证或连接请求，不记录附近设备的 Wi-Fi 扫描。加入白名单或移出黑名单后，对应记录会自动清除。</div>' +
      '<div class="native-table native-rejected-table"><ul class="native-table-head"><li style="width:16%">设备名称</li><li style="width:18%">MAC / IP</li><li style="width:12%">设备类型</li><li style="width:15%">品牌 / 厂商</li><li style="width:11%">SSID / 频段</li><li style="width:16%">最后一次被拒时间</li><li style="width:12%">操作</li></ul><div id="rejected-list"><div class="native-empty">正在读取拒绝记录…</div></div></div>');
    function load() {
      return Promise.all([rpc('web_get_rejected_list', {}), rpc('get_macfilter_info', {})]).then(function (items) {
        state.rejected = asArray(items[0].data || items[0].rejected_list);
        state.rejectedAccess = items[1] || { enable: 0, macpolicy: 'deny' };
        var policy = state.rejectedAccess.macpolicy === 'allow' ? 'allow' : 'deny';
        var activeList = asArray(policy === 'allow' ? state.rejectedAccess.whitelist : state.rejectedAccess.blacklist);
        var activeMacs = {};
        activeList.forEach(function (entry) { activeMacs[normalizeMac(entry.mac || entry.macaddr)] = true; });
        id('rejected-list').innerHTML = state.rejected.length ? state.rejected.map(function (item, index) {
          var address = '<code>' + esc(item.mac || item.uid || '') + '</code>' + (item.ip ? '<small>' + esc(item.ip) + '</small>' : '');
          var itemMac = normalizeMac(item.mac || item.uid);
          var alreadyResolved = policy === 'allow' ? activeMacs[itemMac] : !activeMacs[itemMac];
          var action = alreadyResolved ? (policy === 'allow' ? '已在白名单' : '已移出黑名单') : (policy === 'allow' ? '加入白名单' : '移出黑名单');
          var actionButton = '<button class="edit rejected-policy"' + (alreadyResolved ? ' disabled' : '') + '>' + action + '</button>';
          return '<ul class="native-table-row" data-rejected-index="' + index + '"><li style="width:16%"><b>' + esc(rejectedWifiName(item.name, item.mac || item.uid)) + '</b></li><li style="width:18%">' + address + '</li><li style="width:12%">' + esc(item.device_type || '其他设备') + '</li><li style="width:15%">' + esc(item.vendor || item.brand || '暂未识别') + '</li><li style="width:11%"><b>' + esc(item.ssid || item.network || '未知 SSID') + '</b><small>' + esc(item.band || '未知频段') + '</small><small>' + esc(item.reason_name || '访问控制拒绝') + ' · ' + esc(item.count || 1) + ' 次</small></li><li style="width:16%">' + esc(item.rejected_at || '-') + '</li><li style="width:12%">' + actionButton + '<button class="edit rejected-clear">清除</button></li></ul>';
        }).join('') : '<div class="native-empty">暂无被访问控制拒绝的设备</div>';
        document.querySelectorAll('.rejected-policy').forEach(function (button) {
          bindClick(button, function () {
            var item = state.rejected[Number(button.closest('[data-rejected-index]').getAttribute('data-rejected-index'))];
            var mac = item.mac || item.uid;
            var listItem = { name: rejectedWifiName(item.name, mac), macaddr: mac, mod: policy === 'allow' ? 1 : 0 };
            var change = rpc('set_macfilter', { enable: Number(state.rejectedAccess.enable) ? 1 : 0, macpolicy: policy, list: [listItem] })
              .then(function () { return rpc('clear_rejected_devices', { mac: mac, ssid: item.ssid || '' }); });
            busy(button, change, policy === 'allow' ? '已加入白名单' : '已移出黑名单').then(load);
          });
        });
        document.querySelectorAll('.rejected-clear').forEach(function (button) {
          bindClick(button, function () {
            var item = state.rejected[Number(button.closest('[data-rejected-index]').getAttribute('data-rejected-index'))];
            busy(button, rpc('clear_rejected_devices', { mac: item.mac || item.uid, ssid: item.ssid || '' }), '记录已清除').then(load);
          });
        });
        if (window.parent && window.parent.setHeight) window.parent.setHeight(document.body.scrollHeight + 40, 850);
      }).catch(function (error) { notify(error.message, false); });
    }
    bindClick('#rejected-refresh', load);
    bindClick('#rejected-clear-all', function () { busy(this, rpc('clear_rejected_devices', {}), '拒绝记录已清空').then(load); });
    load();
  }

  function dhcpPage() {
    page('DHCP 静态 IP 分配',
      '<div class="native-table native-static-table"><ul class="native-table-head"><li style="width:30%">设备名称</li><li>IP 地址</li><li>MAC 地址</li><li style="width:20%">操作</li></ul><div id="static-list"><div class="native-empty">正在读取绑定…</div></div></div>' +
      '<button type="button" class="btn cbi-button cbi-button-add" id="static-open">添加</button>');
    function openStaticEditor(item) {
      var host = window.parent && window.parent !== window ? window.parent : window;
      if (!(host.L && typeof host.L.require === 'function')) return notify('系统原生弹窗组件不可用', false);
      host.L.require('ui').then(function (ui) {
        var doc = host.document;
        var form = doc.createElement('div');
        form.className = 'cbi-map';
        form.innerHTML = '<div class="cbi-section">' +
          '<div class="cbi-value"><label class="cbi-value-title">设备名称</label><div class="cbi-value-field"><input class="cbi-input-text" data-field="name" maxlength="63" placeholder="设备名称"></div></div>' +
          '<div class="cbi-value"><label class="cbi-value-title">IP 地址</label><div class="cbi-value-field"><input class="cbi-input-text" data-field="ip" placeholder="192.168.1.100"></div></div>' +
          '<div class="cbi-value"><label class="cbi-value-title">MAC 地址</label><div class="cbi-value-field"><input class="cbi-input-text" data-field="mac" placeholder="AA:BB:CC:DD:EE:FF"></div></div></div>';
        var name = form.querySelector('[data-field="name"]');
        var ip = form.querySelector('[data-field="ip"]');
        var mac = form.querySelector('[data-field="mac"]');
        name.value = item && item.name || '';
        ip.value = item && item.ip || '';
        mac.value = item && item.mac || '';
        var footer = doc.createElement('div'); footer.className = 'right';
        var cancel = doc.createElement('button'); cancel.type = 'button'; cancel.className = 'btn cbi-button cbi-button-neutral'; cancel.textContent = '取消';
        var save = doc.createElement('button'); save.type = 'button'; save.className = 'btn cbi-button cbi-button-positive important'; save.textContent = '保存并应用';
        footer.appendChild(cancel); footer.appendChild(save);
        cancel.addEventListener('click', function () { ui.hideModal(); });
        save.addEventListener('click', function () {
          var ipValue = ip.value.trim(), macValue = mac.value.trim().toUpperCase();
          if (!validateIPv4(ipValue) || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macValue)) return notify('IP 或 MAC 地址格式不正确', false);
          busy(save, rpc('web_set_dhcp_static_ip', { name: name.value.trim() || '未知设备', ip: ipValue, mac: macValue }), '静态绑定已保存').then(function () { ui.hideModal(); return load(); });
        });
        ui.showModal(item ? '编辑绑定设备' : '添加绑定设备', [form, footer]);
      }).catch(function (error) { notify(error.message || '无法打开静态绑定设置', false); });
    }
    function load() {
      return rpc('web_get_dhcp_static_ip', {}).then(function (result) {
        state.static = asArray(result.data);
        id('static-list').innerHTML = state.static.length ? state.static.map(function (item, index) { return '<ul class="native-table-row" data-static-index="' + index + '"><li style="width:30%"><b>' + esc(item.name || '未知设备') + '</b></li><li>' + esc(item.ip) + '</li><li><code>' + esc(item.mac) + '</code></li><li style="width:20%"><button class="edit static-edit">编辑</button> <button class="edit static-delete" data-mac="' + esc(item.mac) + '">删除</button></li></ul>'; }).join('') : '<div class="native-empty">暂无静态绑定</div>';
        document.querySelectorAll('.static-edit').forEach(function (button) { bindClick(button, function () { openStaticEditor(state.static[Number(button.closest('[data-static-index]').getAttribute('data-static-index'))]); }); });
        document.querySelectorAll('.static-delete').forEach(function (button) { bindClick(button, function () { busy(button, rpc('web_del_dhcp_static_ip', { mac: button.dataset.mac }), '绑定已删除').then(load); }); });
      }).catch(function (error) { notify(error.message, false); });
    }
    bindClick('#static-open', function () { openStaticEditor(null); });
    load();
  }

  function qosPage() {
    page('访客 Wi-Fi 限速',
      row('启用', toggle('qos-enabled', '')) + '<div id="qos-fields"><div class="native-grid">' + row('上传速度（Mbps）', input('qos-upload', 'number', '0.5', 'min="0" step="0.1"')) + row('下载速度（Mbps）', input('qos-download', 'number', '0.5', 'min="0" step="0.1"')) + '</div></div>' + buttons(['qos-save', '保存']) +
      section('奖励模式', row('模式', select('qos-mode', [['0', '性能优先'], ['1', '智能均衡'], ['2', '上网优先']])) + buttons(['qos-mode-save', '保存'])));
    id('qos-enabled').addEventListener('change', function () { show('#qos-fields', checked('qos-enabled')); });
    bindClick('#qos-save', function () { busy(this, rpc('web_set_guest_limit_speed', { enable: checked('qos-enabled') ? 1 : 0, upload: number('qos-upload'), download: number('qos-download') }), '访客限速已即时保存').then(function () { reloadView(); }); });
    bindClick('#qos-mode-save', function () { busy(this, rpc('web_set_credit_mode', { mode: value('qos-mode') }), '流量模式已保存').then(function () { reloadView(); }); });
    Promise.all([rpc('web_get_guest_limit_speed', {}), rpc('web_get_credit_mode', {})]).then(function (items) { check('qos-enabled', items[0].enable); set('qos-upload', items[0].upload); set('qos-download', items[0].download); set('qos-mode', items[1].mode); show('#qos-fields', checked('qos-enabled')); }).catch(function (error) { notify(error.message, false); });
  }

  function ddnsPage() {
    page('DDNS', '<style>#be6500-native-root .ddns-config-panel .native-row>.cbi-value-title{text-align:left!important;white-space:nowrap!important;word-break:keep-all!important}</style><div class="native-settings-grid">' +
      '<section class="native-settings-panel ddns-config-panel"><h2>Cloudflare DDNS</h2>' +
      '<div class="native-check-line">' + toggle('ddns-enabled', '启用 IPv4 DDNS') + toggle('ddns6-enabled', '启用 IPv6 DDNS') + '</div>' +
      row('IPv4 完整域名', input('ddns-domain', 'text', 'home.example.com', 'maxlength="253"')) +
      row('IPv6 完整域名', input('ddns6-domain', 'text', 'home6.example.com', 'maxlength="253"')) +
      row('Cloudflare 区域域名', input('ddns-zone', 'text', 'example.com', 'maxlength="253"')) +
      row('Cloudflare 邮箱', input('ddns-email', 'email', 'name@example.com', 'maxlength="253"')) +
      row('Global API Key', password('ddns-key', '')) +
      row('更新方式', select('ddns-interval', [['dial', '仅拨号成功后运行一次'], ['1', '每 1 分钟'], ['2', '每 2 分钟'], ['5', '每 5 分钟'], ['10', '每 10 分钟'], ['15', '每 15 分钟'], ['20', '每 20 分钟'], ['30', '每 30 分钟'], ['60', '每 60 分钟']])) +
      '<p class="native-info">“仅拨号成功后运行一次”会在 WAN 拨号获得地址后更新，不建立定时任务；IPv6 DDNS 使用 AAAA 记录，取消勾选并保存会删除对应的 AAAA 记录。</p>' + buttons(['ddns-save', '保存 DDNS 设置']) + '</section>' +
      '<section class="native-settings-panel"><h2>DDNS 状态</h2><div class="native-meta" id="ddns-status">' +
      '<div><small>WAN 接口 IPv4</small><span id="ddns-status-ip4">正在读取…</span></div><div><small>IPv4 解析记录</small><span id="ddns-status-record4">—</span></div>' +
      '<div><small>WAN 接口 IPv6</small><span id="ddns-status-ip6">—</span></div><div><small>IPv6 解析记录</small><span id="ddns-status-record6">—</span></div>' +
      '<div><small>上次运行时间</small><span id="ddns-status-time">—</span></div><div><small>上次结果</small><span id="ddns-status-result">—</span></div></div>' +
      '<div class="native-inline-actions"><button type="button" class="btn cbi-button cbi-button-neutral" id="ddns-refresh">刷新状态</button><button type="button" class="btn cbi-button cbi-button-action" id="ddns-run">立即更新</button></div></section></div>' +
      '<section class="native-settings-panel native-settings-wide"><h2>DDNS 运行日志</h2><pre id="ddns-log" class="native-log">正在读取日志…</pre></section>');
    initPasswordButtons();
    function loadConfig() { return rpc('get_cf_ddns', {}).then(function (result) { check('ddns-enabled', result.enabled); check('ddns6-enabled', result.enabled6); set('ddns-domain', result.domain); set('ddns6-domain', result.domain6 || result.domain); set('ddns-zone', result.zone); set('ddns-email', result.email); set('ddns-key', result.key); set('ddns-interval', result.interval || 'dial'); }); }
    function loadStatus() { return Promise.all([rpc('get_cf_ddns_status', {}), rpc('get_cf_ddns_log', {})]).then(function (items) { var result = items[0], ipv6Enabled = Number(result.enabled6) === 1; id('ddns-status-ip4').textContent = result.ipv4 || '—'; id('ddns-status-record4').textContent = result.record4 || '—'; id('ddns-status-ip6').textContent = ipv6Enabled ? (result.ipv6 || '—') : '未启用'; id('ddns-status-record6').textContent = ipv6Enabled ? (result.record6 || '—') : '未启用'; id('ddns-status-time').textContent = result.last_time || '—'; id('ddns-status-result').textContent = result.last_result || '—'; id('ddns-log').textContent = items[1].log || '暂无日志'; }).catch(function (error) { notify(error.message || 'DDNS 状态读取失败', false); }); }
    bindClick('#ddns-save', function () { var button = this; busy(button, rpc('save_cf_ddns', { enabled: checked('ddns-enabled') ? 1 : 0, enabled6: checked('ddns6-enabled') ? 1 : 0, domain: value('ddns-domain'), domain6: value('ddns6-domain'), zone: value('ddns-zone'), email: value('ddns-email'), key: value('ddns-key'), interval: value('ddns-interval') }), 'DDNS 设置已保存').then(function () { return loadStatus(); }); });
    bindClick('#ddns-refresh', function () { busy(this, loadStatus(), '状态已刷新'); });
    bindClick('#ddns-run', function () { busy(this, rpc('run_cf_ddns', {}), 'DDNS 更新完成').then(loadStatus); });
    loadConfig().then(loadStatus).catch(function (error) { notify(error.message, false); });
  }

  function certificatesPage() {
    page('证书管理', '<style>.cert-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:18px 0}.cert-toolbar button{width:auto!important;min-width:88px!important;height:38px!important;min-height:38px!important;padding:0 15px!important;font-size:14px!important;line-height:36px!important}.cert-table{overflow-x:auto}.cert-table>ul,.cert-table>#cert-list>ul{min-width:1180px}.cert-table li{width:auto!important}.cert-table li:nth-child(1){flex:0 0 17%}.cert-table li:nth-child(2){flex:0 0 18%}.cert-table li:nth-child(3){flex:0 0 16%}.cert-table li:nth-child(4){flex:0 0 9%}.cert-table li:nth-child(5),.cert-table li:nth-child(6){flex:0 0 8%}.cert-table li:nth-child(7){flex:1;min-width:180px}.cert-state{display:inline-block;padding:3px 9px;border:1px solid;border-radius:5px}.cert-state-ok{color:#1597f5;border-color:#70c4ff;background:rgba(21,151,245,.08)}.cert-state-warn{color:#d79b16;border-color:#d79b16}.cert-state-bad{color:#e34b4b;border-color:#e34b4b}.cert-row-actions{display:flex;align-items:center;gap:7px;white-space:nowrap}.cert-row-actions .cbi-button{margin:0!important}.cert-check{width:18px;height:18px;vertical-align:middle;cursor:pointer}.cert-save-wrap{display:flex;justify-content:flex-end;margin:18px 0}.cert-save-wrap button{min-width:96px}.cert-dialog textarea{width:100%;min-height:130px}.cert-dialog .cbi-value-field{min-width:0}.cert-dialog-section{margin:12px 0 4px;padding-top:12px;border-top:1px solid var(--border-color-medium,rgba(127,127,127,.25));font-size:16px}</style><div class="cert-toolbar"><button class="btn cbi-button cbi-button-action" id="cert-open-issue">申请证书</button><button class="btn cbi-button cbi-button-action" id="cert-open-upload">上传证书</button></div>' +
      '<style>.cert-toolbar button{min-width:72px!important;height:34px!important;min-height:34px!important;padding:0 12px!important;font-size:13px!important;line-height:32px!important}</style><div class="native-table cert-table"><ul class="native-table-head"><li>域名</li><li>其他域名</li><li>过期时间</li><li>状态</li><li>应用</li><li>自动续期</li><li>操作</li></ul><div id="cert-list"><div class="native-empty">正在读取证书…</div></div></div><div class="cbi-page-actions native-actions"><button type="button" class="btn cbi-button cbi-button-apply" id="cert-save">保存</button></div>' +
      '<section class="native-settings-panel native-settings-wide"><h2>运行日志</h2><pre id="cert-log" class="native-log">暂无日志</pre></section>');
    var tableStyle = document.createElement('style');
    tableStyle.textContent = '.cert-table{overflow-x:auto!important;width:100%!important;box-sizing:border-box}.cert-table>ul,.cert-table>#cert-list>ul{display:flex!important;width:100%!important;min-width:1280px!important;box-sizing:border-box}.cert-table li{display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;min-width:0!important;box-sizing:border-box}.cert-table li:nth-child(1){flex:0 0 20%!important}.cert-table li:nth-child(2){flex:0 0 19%!important}.cert-table li:nth-child(3){flex:0 0 17%!important}.cert-table li:nth-child(4){flex:0 0 10%!important}.cert-table li:nth-child(5){flex:0 0 7%!important}.cert-table li:nth-child(6){flex:0 0 9%!important}.cert-table li:nth-child(7){flex:0 0 18%!important}.cert-row-actions{justify-content:center!important;gap:7px}';
    document.head.appendChild(tableStyle);
    var config = {};
    var savedSecretMask = '••••••••••••••••••••••••';
    function field(form, name) { var node = form.querySelector('[name="' + name + '"]'); if (!node) return ''; var value = node.value.trim(); return node.dataset.savedSecret === '1' && value === savedSecretMask ? '' : value; }
    function checkedField(form, name) { var node = form.querySelector('[name="' + name + '"]'); return !!(node && node.checked); }
    function modal(title, body, submitText, submit) {
      var host = window.parent && window.parent !== window ? window.parent : window;
      host.L.require('ui').then(function (ui) {
        if (!host.document.getElementById('be6500-cert-modal-theme')) {
          var modalTheme = host.document.createElement('style');
          modalTheme.id = 'be6500-cert-modal-theme';
          modalTheme.textContent = '.be6500-cert-detail{box-sizing:border-box;width:100%;max-height:340px;min-height:120px;margin:0;padding:18px;border:1px solid var(--border-color-medium,rgba(127,127,127,.35));border-radius:6px;background:var(--background-color-high,transparent);color:var(--text-color-high,var(--text-color-highest,inherit));font:inherit;line-height:1.7;white-space:pre-wrap;overflow:auto;color-scheme:inherit}.cert-dialog{height:auto!important;min-height:0!important;margin-bottom:0!important}.cert-dialog .cbi-value{margin-bottom:.45rem!important}.cert-dialog .cert-dialog-section{height:auto!important;margin:.45rem 0 .25rem!important;padding-top:.55rem!important}.cert-dialog.native-page .native-password{display:flex!important;max-width:100%!important;border:0!important;background:transparent!important;box-sizing:border-box!important}.cert-dialog.native-page .native-password>.cbi-input-text{flex:1 1 auto!important;width:auto!important;min-width:0!important;box-sizing:border-box!important;border-radius:var(--border-radius,.25rem) 0 0 var(--border-radius,.25rem)!important}.cert-dialog.native-page .native-password>button{position:static!important;flex:0 0 2.5rem!important;width:2.5rem!important;min-width:0!important;margin:0!important;padding:.5em!important;box-sizing:border-box!important;border:1px solid var(--border-color-medium,rgba(127,127,127,.35))!important;border-left:0!important;border-radius:0 var(--border-radius,.25rem) var(--border-radius,.25rem) 0!important;background:var(--background-color-high,transparent)!important;color:inherit!important;font-weight:bold!important;line-height:normal!important}';
          host.document.head.appendChild(modalTheme);
        }
        var form = host.document.createElement('div'); form.className = 'cbi-map native-page cert-dialog'; form.innerHTML = body;
        var progress = host.document.createElement('div'); progress.className = 'alert-message info'; progress.style.display = 'none'; progress.style.marginTop = '12px'; progress.textContent = '正在处理，DNS 验证和 CA 签发通常需要 1–5 分钟，请勿重复点击或关闭页面。';
        form.appendChild(progress);
        var footer = host.document.createElement('div'); footer.className = 'right';
        var cancel = host.document.createElement('button'); cancel.className = 'btn cbi-button cbi-button-neutral'; cancel.textContent = '取消';
        var save = host.document.createElement('button'); save.className = 'btn cbi-button cbi-button-positive important'; save.textContent = submitText;
        var closeOnly = submitText === '关闭';
        cancel.onclick = function () { ui.hideModal(); }; save.onclick = closeOnly ? function () { ui.hideModal(); } : function () {
          var originalText = save.textContent;
          save.disabled = true; cancel.disabled = true; save.textContent = originalText + '中…'; progress.style.display = '';
          Promise.resolve(submit(form)).then(function (result) {
            ui.hideModal(); notify((result && result.message) || originalText + '成功', true); return load();
          }).catch(function (error) {
            progress.textContent = '操作失败：' + (error.message || '请查看运行日志'); progress.className = 'alert-message error';
            notify(error.message || '操作失败', false);
          }).finally(function () { save.disabled = false; cancel.disabled = false; save.textContent = originalText; });
        };
        if (!closeOnly) footer.appendChild(cancel);
        footer.appendChild(save); ui.showModal(title, [form, footer]);
        [['certlocal', 'cert'], ['keylocal', 'key']].forEach(function (pair) { var upload = form.querySelector('[name="' + pair[0] + '"]'), target = form.querySelector('[name="' + pair[1] + '"]'); if (upload && target) upload.addEventListener('change', function () { var file = upload.files && upload.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function () { target.value = String(reader.result || ''); }; reader.readAsText(file); }); });
        form.querySelectorAll('.cert-password-toggle').forEach(function (button) { button.addEventListener('click', function () { var input = button.parentNode.querySelector('input'); if (!input) return; var hidden = input.type === 'password'; input.type = hidden ? 'text' : 'password'; button.textContent = hidden ? '◉' : '*'; button.setAttribute('aria-pressed', hidden ? 'true' : 'false'); button.setAttribute('aria-label', hidden ? '隐藏密钥' : '显示密钥'); button.setAttribute('title', hidden ? '隐藏密钥' : '显示密钥'); }); });
        form.querySelectorAll('input[data-saved-secret="1"]').forEach(function (input) {
          input.addEventListener('focus', function () { input.select(); });
          input.addEventListener('input', function () { if (input.value !== savedSecretMask) delete input.dataset.savedSecret; });
        });
        var dnsProvider = form.querySelector('select[name="dns_provider"]');
        var secretControl = form.querySelector('.native-password');
        if (dnsProvider && secretControl) {
          var providerRect = dnsProvider.getBoundingClientRect();
          secretControl.style.setProperty('width', providerRect.width + 'px', 'important');
          secretControl.style.setProperty('height', providerRect.height + 'px', 'important');
          secretControl.querySelectorAll('input,button').forEach(function (control) {
            control.style.setProperty('height', providerRect.height + 'px', 'important');
            control.style.setProperty('min-height', providerRect.height + 'px', 'important');
          });
        }
      });
    }
    function inputRow(label, name, valueText, placeholder, type) { return '<div class="cbi-value"><label class="cbi-value-title">' + label + '</label><div class="cbi-value-field"><input class="cbi-input-text" type="' + (type || 'text') + '" name="' + name + '" value="' + esc(valueText || '') + '" placeholder="' + esc(placeholder || '') + '"></div></div>'; }
    function passwordRow(label, name, placeholder, saved) { return '<div class="cbi-value"><label class="cbi-value-title">' + label + '</label><div class="cbi-value-field"><div class="native-password"><input class="cbi-input-text" type="password" name="' + name + '" value="' + (saved ? savedSecretMask : '') + '"' + (saved ? ' data-saved-secret="1"' : '') + ' placeholder="' + esc(saved ? '' : (placeholder || '')) + '" autocomplete="new-password"><button type="button" class="btn cbi-button cbi-button-neutral cert-password-toggle" data-password="1" aria-label="显示或隐藏密钥">*</button></div></div></div>'; }
    function selectRow(label, name, options, current) { return '<div class="cbi-value"><label class="cbi-value-title">' + label + '</label><div class="cbi-value-field"><select class="cbi-input-select" name="' + name + '">' + options.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === current ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div>'; }
    function saveIssue(form) {
      var acme = { name: '', email: field(form, 'acme_email'), provider: field(form, 'ca') };
      var dns = { name: '', provider: field(form, 'dns_provider'), email: field(form, 'dns_email'), secret: field(form, 'secret') };
      return rpc('save_cert_acme_account', acme).then(function () { return rpc('save_cert_dns_account', dns); }).then(function () {
        return rpc('save_cert_settings', { domain: field(form, 'domain'), other_domains: field(form, 'others'), acme_email: acme.email, dns_provider: dns.provider, dns_email: dns.email, dns_secret: dns.secret, auto_renew: checkedField(form, 'auto') ? 1 : 0, cert_file: field(form, 'certfile'), key_file: field(form, 'keyfile') });
      });
    }
    function openIssue() { modal('申请证书',
      '<h3 class="cert-dialog-section">证书信息</h3>' + inputRow('主域名', 'domain', '', '例如 example.com 或 *.example.com') + inputRow('其他域名', 'others', '', '使用逗号分隔') + inputRow('证书路径', 'certfile', '', '留空按域名自动生成') + inputRow('私钥路径', 'keyfile', '', '留空按域名自动生成') + '<div class="cbi-value"><label class="cbi-value-title">自动续期</label><div class="cbi-value-field"><input type="checkbox" name="auto" checked> 启用</div></div>' +
      '<h3 class="cert-dialog-section">ACME 账户</h3>' + inputRow('邮箱', 'acme_email', config.acme_email, 'ACME 账户邮箱', 'email') + selectRow('证书机构', 'ca', [['letsencrypt', "Let's Encrypt"], ['zerossl', 'ZeroSSL'], ['buypass', 'Buypass'], ['google', 'Google Trust Services']], config.ca || 'letsencrypt') +
      '<h3 class="cert-dialog-section">DNS 账户</h3>' + selectRow('服务商', 'dns_provider', [['cloudflare_token', 'Cloudflare API Token'], ['cloudflare_global', 'Cloudflare Global API Key']], config.dns_provider || 'cloudflare_token') + inputRow('邮箱', 'dns_email', config.dns_email, 'Global API Key 模式填写', 'email') + passwordRow('API Token / Key', 'secret', '请输入凭据', Number(config.secret_saved) === 1),
      '申请', function (form) { return saveIssue(form).then(function (result) { return rpc('issue_certificate', { id: result.id }); }); }); }
    function openUpload() { modal('上传证书', '<p class="alert-message info">系统会自动校验证书及私钥内容。</p>' + inputRow('域名', 'domain', '', '证书主域名') + inputRow('证书文件', 'certlocal', '', '', 'file') + inputRow('私钥文件', 'keylocal', '', '', 'file') + '<div class="cbi-value"><label class="cbi-value-title">证书内容</label><div class="cbi-value-field"><textarea class="cbi-input-text" name="cert" rows="6"></textarea></div></div><div class="cbi-value"><label class="cbi-value-title">私钥内容</label><div class="cbi-value-field"><textarea class="cbi-input-text" name="key" rows="6"></textarea></div></div>' + inputRow('证书路径', 'certfile', '', '留空自动生成默认路径') + inputRow('私钥路径', 'keyfile', '', '留空自动生成默认路径'), '保存', function (form) { return rpc('save_cert_settings', { domain: field(form, 'domain'), other_domains: '', acme_email: config.acme_email || 'router@localhost.local', dns_provider: config.dns_provider || 'cloudflare_token', dns_email: config.dns_email, dns_secret: '', auto_renew: config.auto_renew, cert_file: field(form, 'certfile'), key_file: field(form, 'keyfile') }).then(function (result) { return rpc('upload_certificate', { id: result.id, certificate: field(form, 'cert'), private_key: field(form, 'key') }); }); }); }
    var certPollTimer = null;
    function load() { return Promise.all([rpc('get_cert_settings', {}), rpc('get_certificate_log', {})]).then(function (items) { config = items[0] || {}; id('cert-log').textContent = items[1].log || '暂无日志'; var certs = asArray(config.certificates); id('cert-list').innerHTML = certs.length ? certs.map(function (cert) { return '<ul class="native-table-row" data-cert-id="' + esc(cert.id) + '"><li><b>' + esc(cert.domain || '已上传证书') + '</b></li><li>' + esc(cert.other_domains || '-') + '</li><li>' + esc(cert.expires_at || '-') + '</li><li><span class="cert-state ' + (cert.cert_state === '正常' ? 'cert-state-ok' : (cert.cert_state === '申请中' || cert.cert_state === '即将过期' ? 'cert-state-warn' : 'cert-state-bad')) + '">' + esc(cert.cert_state || '未安装') + '</span></li><li><input class="cert-check cert-apply-box" type="checkbox" name="cert-applied" aria-label="应用到 HTTPS" data-id="' + esc(cert.id) + '"' + (Number(cert.applied) ? ' checked' : '') + (Number(cert.present) ? '' : ' disabled') + '></li><li><input class="cert-check cert-auto-box" type="checkbox" aria-label="自动续期" data-id="' + esc(cert.id) + '"' + (Number(cert.auto_renew) ? ' checked' : '') + '></li><li><div class="cert-row-actions"><button class="btn cbi-button cbi-button-neutral cert-detail" data-id="' + esc(cert.id) + '">详情</button><button class="btn cbi-button cbi-button-action cert-renew" data-id="' + esc(cert.id) + '">更新</button><button class="btn cbi-button cbi-button-negative cert-remove" data-id="' + esc(cert.id) + '">删除</button></div></li></ul>'; }).join('') : '<div class="native-empty">暂无证书</div>';
      document.querySelectorAll('.cert-apply-box').forEach(function (box) { box.addEventListener('change', function () { if (!box.checked) return; document.querySelectorAll('.cert-apply-box').forEach(function (other) { if (other !== box) other.checked = false; }); }); });
      document.querySelectorAll('.cert-renew').forEach(function (b) { bindClick(b, function () { busy(b, rpc('renew_certificate', { id: b.dataset.id }), '证书已更新').then(load); }); });
      document.querySelectorAll('.cert-remove').forEach(function (b) { bindClick(b, function () {
        var certId = b.dataset.id;
        confirmDialog('删除证书', '确定删除当前证书吗？如果它正在用于管理页面 HTTPS，删除后将同时停止应用该证书。').then(function (confirmed) {
          if (!confirmed) return;
          busy(b, rpc('delete_certificate', { id: certId }), '证书已删除').then(function () {
            return load();
          }).catch(function () {});
        });
      }); });
      document.querySelectorAll('.cert-detail').forEach(function (b) { bindClick(b, function () { var cert = certs.find(function (item) { return item.id === b.dataset.id; }) || {}; modal('证书详情', '<pre class="be6500-cert-detail">' + esc(cert.details || '暂无证书详情') + '\n\n证书路径：' + esc(cert.cert_file || '') + '\n私钥路径：' + esc(cert.key_file || '') + '</pre>', '关闭', function () { return Promise.resolve(); }); }); });
      if (certPollTimer) { clearTimeout(certPollTimer); certPollTimer = null; }
      var hasPending = false;
      for (var ci = 0; ci < certs.length; ci++) {
        if (certs[ci] && certs[ci].cert_state === '申请中') { hasPending = true; break; }
      }
      if (hasPending) certPollTimer = setTimeout(function () { load().catch(function () {}); }, 3000);
    }); }
    bindClick('#cert-open-issue', openIssue); bindClick('#cert-open-upload', openUpload);
    bindClick('#cert-save', function () { var autoStates = [].map.call(document.querySelectorAll('.cert-auto-box'), function (box) { return box.dataset.id + ':' + (box.checked ? '1' : '0'); }).join(','), applyBox = document.querySelector('.cert-apply-box:checked'); busy(this, rpc('save_certificate_preferences', { auto_states: autoStates, applied_id: applyBox ? applyBox.dataset.id : '' }), '证书设置已保存').then(load); });
    load().catch(function (error) { notify(error.message || '证书状态读取失败', false); });
  }

  function portPage() {
    page('端口转发', '<div class="native-table native-advanced-table native-pf-table"><ul class="native-table-head"><li>名称</li><li>协议</li><li>外部端口</li><li>内部 IP 地址</li><li>内部端口</li><li>操作</li></ul><div id="pf-list"><div class="native-empty">正在读取规则…</div></div></div>' +
      '<button type="button" class="btn cbi-button cbi-button-add" id="pf-open">添加规则</button>' +
      '<div class="native-modal-mask"></div><div class="modal cbi-modal native-modal" id="pf-modal"><div class="native-modal-head"><h4>添加端口转发</h4><button type="button" class="btn cbi-button cbi-button-neutral native-modal-close" aria-label="关闭">×</button></div><div class="native-modal-body">' +
      row('名称', input('pf-name', 'text', '服务名称')) + row('协议', select('pf-proto', [['tcp udp', 'TCP + UDP'], ['tcp', 'TCP'], ['udp', 'UDP']])) + row('外部端口', input('pf-out', 'text', '8080')) + row('内部 IP', input('pf-ip', 'text', '192.168.1.100')) + row('内部端口', input('pf-in', 'text', '80')) + buttons(['pf-save', '确认']) + '</div></div>');
    function modal(open) { document.querySelector('.native-modal-mask').classList.toggle('open', open); id('pf-modal').classList.toggle('open', open); }
    function load() { return rpc('get_port_forward', {}).then(function (result) { state.forwards = result.info || []; id('pf-list').innerHTML = state.forwards.length ? state.forwards.map(function (item) { return '<ul class="native-table-row"><li><b>' + esc(item.name) + '</b></li><li>' + esc(item.proto) + '</li><li>' + esc(item.src_dport) + '</li><li>' + esc(item.dest_ip) + '</li><li>' + esc(item.dest_port) + '</li><li><button class="edit pf-delete" data-name="' + esc(item.name) + '">删除</button></li></ul>'; }).join('') : '<div class="native-empty">暂无端口转发规则</div>'; document.querySelectorAll('.pf-delete').forEach(function (button) { bindClick(button, function () { busy(button, rpc('del_port_forward', { name: button.dataset.name }), '规则已删除').then(load); }); }); }).catch(function (error) { notify(error.message, false); }); }
    bindClick('#pf-open', function () { modal(true); }); bindClick('.native-modal-close', function () { modal(false); }); bindClick('.native-modal-mask', function () { modal(false); });
    bindClick('#pf-save', function () { if (!value('pf-name') || !validateIPv4(value('pf-ip'))) return notify('名称或内部 IP 不正确', false); busy(this, rpc('set_port_forward', { name: value('pf-name'), proto: value('pf-proto'), 'src-dport': value('pf-out'), ipaddr: value('pf-ip'), 'dest-port': value('pf-in') }), '端口转发已保存').then(function () { modal(false); return load(); }); });
    load();
  }

  function dmzPage() {
    page('DMZ', '<p class="seniorManagement_info_p native-advanced-description">开启 DMZ 功能可以将内网指定设备的 IP 映射到外网，方便从外网访问该设备，但存在安全风险。</p>' + row('启用', toggle('dmz-enabled', '')) + row('主机 IP 地址', input('dmz-ip', 'text', '192.168.1.100')) + buttons(['dmz-save', '保存']));
    bindClick('#dmz-save', function () { if (checked('dmz-enabled') && !validateIPv4(value('dmz-ip'))) return notify('请输入正确的 DMZ 主机地址', false); busy(this, rpc('set_dmz', { on_off: checked('dmz-enabled') ? 1 : 0, ipaddr: value('dmz-ip') }), 'DMZ 设置已保存').then(function () { reloadView(); }); });
    rpc('get_dmz', {}).then(function (result) { check('dmz-enabled', result.on_off); set('dmz-ip', result.ipaddr); }).catch(function (error) { notify(error.message, false); });
  }

  function upnpPage() {
    page('UPnP', row('启用', toggle('upnp-enabled', '')) + '<div id="upnp-list" class="native-table native-advanced-table"><div class="native-empty">正在读取端口映射…</div></div>' + buttons(['upnp-save', '保存']));
    bindClick('#upnp-save', function () { busy(this, rpc('set_upnp', { enabled: checked('upnp-enabled') ? 1 : 0 }), 'UPnP 设置已保存').then(function () { reloadView(); }); });
    rpc('get_upnp', {}).then(function (result) { check('upnp-enabled', result.enable); var data = result.data || []; id('upnp-list').innerHTML = data.length ? '<ul class="native-table-head"><li>协议</li><li>外部端口</li><li>内部地址</li><li>描述</li></ul>' + data.map(function (item) { return '<ul class="native-table-row"><li>' + esc(item.proto || item.protocol || '—') + '</li><li>' + esc(item.external_port || item.extport || '—') + '</li><li>' + esc(item.internal_client || item.host || '—') + '</li><li>' + esc(item.description || item.desc || '—') + '</li></ul>'; }).join('') : '<div class="native-empty">当前没有动态端口映射</div>'; }).catch(function (error) { notify(error.message, false); });
  }

  function hostsPage() {
    page('自定义 Hosts', '<p class="seniorManagement_info_p native-advanced-description">提高域名解析速度，屏蔽不健康站点</p><div class="native-hosts-box"><textarea id="hosts-text" rows="15" placeholder="192.168.1.10 nas.home\n192.168.1.20 tv.home"></textarea><div><p>IP 地址和域名之间必须包含一个空格</p><p>每行一条记录</p></div></div>' + buttons(['hosts-save', '保存'], ['hosts-clear', '恢复默认设置']));
    bindClick('#hosts-save', function () { busy(this, rpc('web_set_custom_hosts', { hosts: id('hosts-text').value }), 'Hosts 已保存并刷新 DNS').then(function () { reloadView(); }); });
    bindClick('#hosts-clear', function () { id('hosts-text').value = ''; });
    rpc('web_get_custom_hosts', {}).then(function (result) { id('hosts-text').value = result.hosts || ''; }).catch(function (error) { notify(error.message, false); });
  }

  function ledPage() {
    page('灯光控制',
      row('指示灯', toggle('led-enabled', '开启机身指示灯')) +
      '<div id="led-fields">' +
        row('控制方式', select('led-policy', [['auto', '原厂自动'], ['custom', '自定义']])) +
        '<div id="led-auto-info" class="native-status">原厂逻辑：未联网显示红色，联网正常显示蓝色，原厂插件运行时显示绿色。</div>' +
        '<div id="led-custom-fields" class="native-led-rules">' +
        '<p class="native-advanced-description">按设备状态设置指示灯颜色和显示方式。拖拽规则可调整优先级，越靠上优先级越高。</p>' +
        '<div class="native-led-rule-head"><span>设备状态</span><span>灯光颜色</span><span>显示方式</span><span></span><span></span></div>' +
        '<div id="led-rule-list"></div>' +
        '<button type="button" class="btn cbi-button cbi-button-add" id="led-rule-add">添加规则</button>' +
        '</div>' +
      '</div>' +
      buttons(['led-save', '保存灯光设置'])
    );
    var stateOptions = [['booting', '系统启动中'], ['upgrading', '固件升级中'], ['overheat', '温度过高（≥85°C）'],
        ['wps', 'WPS 配对中'], ['wifi_off', 'Wi-Fi 全部关闭'], ['offline', 'WAN 未联网'], ['online', 'WAN 已联网'],
        ['usb', 'USB 设备已接入'], ['plugin', 'QWRT 边缘计算服务运行（旧版兼容）'], ['default', '其他状态']],
        colorOptions = [['red', '红色'], ['green', '绿色'], ['blue', '蓝色']],
        modeOptions = [['steady', '常亮'], ['slow', '慢速闪烁'], ['fast', '快速闪烁']],
        ruleIndex = 0;
    function options(items, selected) {
      return items.map(function (item) { return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + esc(item[1]) + '</option>'; }).join('');
    }
    function colorPicker(selected) {
      var active = String(selected || 'blue').split('+');
      function marked(color) { return active.indexOf(color) >= 0 ? ' checked' : ''; }
      return '<details class="led-rule-colors"><summary>选择颜色</summary><div>' + colorOptions.map(function (item) {
        return '<label><input type="checkbox" value="' + item[0] + '"' + marked(item[0]) + '><span>' + item[1] + '</span></label>';
      }).join('') + '</div></details>';
    }
    function syncColorSummary(node) {
      var colors = [], labels = { red: '红色', green: '绿色', blue: '蓝色' }, mixed = {
        'red+green': '黄色', 'red+blue': '紫色', 'green+blue': '青色', 'red+green+blue': '白色'
      };
      node.querySelectorAll('.led-rule-colors input:checked').forEach(function (field) { colors.push(field.value); });
      var names = colors.map(function (color) { return labels[color]; }), result = mixed[colors.join('+')], summary = node.querySelector('.led-rule-colors summary');
      var channels = colors.map(function (color) { return labels[color].replace('色', ''); }).join(' + ');
      summary.textContent = names.length ? (result ? result + '（' + channels + '）' : names[0]) : '选择颜色';
      summary.title = result ? channels + ' = ' + result : (names[0] || '');
    }
    function addRule(rule) {
      rule = rule || { state: 'default', color: 'blue', mode: 'steady', enabled: 1 };
      var node = document.createElement('div');
      node.className = 'native-led-rule';
      node.draggable = true;
      node.setAttribute('data-led-rule', String(ruleIndex++));
      node.innerHTML = '<select class="cbi-input-select led-rule-state">' + options(stateOptions, rule.state) + '</select>' +
        colorPicker(rule.color) +
        '<select class="cbi-input-select led-rule-mode">' + options(modeOptions, rule.mode || rule.effect) + '</select>' +
        '<button type="button" class="btn cbi-button cbi-button-neutral led-rule-drag" title="拖拽调整优先级" aria-label="拖拽调整优先级">≡</button>' +
        '<button type="button" class="btn cbi-button cbi-button-negative led-rule-delete">删除</button>';
      id('led-rule-list').appendChild(node);
      syncColorSummary(node);
      node.querySelectorAll('.led-rule-colors input').forEach(function (field) { field.addEventListener('change', function () { syncColorSummary(node); }); });
      node.querySelector('.led-rule-colors').addEventListener('toggle', function () {
        var current = this;
        if (!current.open) return;
        document.querySelectorAll('.led-rule-colors[open]').forEach(function (picker) {
          if (picker !== current) picker.removeAttribute('open');
        });
      });
      bindClick(node.querySelector('.led-rule-delete'), function () { node.parentNode.removeChild(node); });
      node.querySelector('.led-rule-drag').addEventListener('mousedown', function () { node._allowDrag = true; });
      node.addEventListener('dragstart', function (event) {
        if (!node._allowDrag) { event.preventDefault(); return; }
        node.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.getAttribute('data-led-rule'));
      });
      node.addEventListener('dragend', function () {
        node._allowDrag = false;
        node.classList.remove('is-dragging');
        document.querySelectorAll('.native-led-rule.is-drag-over').forEach(function (item) { item.classList.remove('is-drag-over'); });
      });
    }
    id('led-rule-list').addEventListener('dragover', function (event) {
      var dragging = this.querySelector('.native-led-rule.is-dragging');
      if (!dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      var target = event.target.closest('.native-led-rule');
      this.querySelectorAll('.native-led-rule.is-drag-over').forEach(function (item) { item.classList.remove('is-drag-over'); });
      if (!target || target === dragging) return;
      target.classList.add('is-drag-over');
      var box = target.getBoundingClientRect();
      this.insertBefore(dragging, event.clientY < box.top + box.height / 2 ? target : target.nextSibling);
    });
    id('led-rule-list').addEventListener('drop', function (event) {
      if (this.querySelector('.native-led-rule.is-dragging')) event.preventDefault();
    });
    function collectRules() {
      return [].slice.call(document.querySelectorAll('[data-led-rule]')).map(function (node) {
        var colors = [].slice.call(node.querySelectorAll('.led-rule-colors input:checked')).map(function (field) { return field.value; });
        return { state: node.querySelector('.led-rule-state').value, color: colors.join('+'),
          mode: node.querySelector('.led-rule-mode').value, enabled: 1 };
      });
    }
    function syncFields() {
      var enabled = checked('led-enabled'), custom = value('led-policy') === 'custom';
      show('#led-fields', enabled);
      show('#led-auto-info', enabled && !custom);
      show('#led-custom-fields', enabled && custom);
    }
    id('led-enabled').addEventListener('change', syncFields);
    id('led-policy').addEventListener('change', syncFields);
    document.addEventListener('click', function (event) {
      document.querySelectorAll('.led-rule-colors[open]').forEach(function (picker) {
        if (!picker.contains(event.target)) picker.removeAttribute('open');
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.querySelectorAll('.led-rule-colors[open]').forEach(function (picker) { picker.removeAttribute('open'); });
    });
    bindClick('#led-rule-add', function () { addRule(); });
    bindClick('#led-save', function () {
      if ([].slice.call(document.querySelectorAll('[data-led-rule]')).some(function (node) { return !node.querySelector('.led-rule-colors input:checked'); })) return notify('每条规则请至少选择一种灯光颜色', false);
      busy(this, rpc('set_led_control', {
        enabled: checked('led-enabled') ? 1 : 0,
        policy: value('led-policy'),
        color: 'blue',
        mode: 'steady',
        rules: collectRules()
      }), '灯光设置已保存');
    });
    rpc('get_led_control', {}).then(function (result) {
      check('led-enabled', result.enabled);
      set('led-policy', result.policy || 'auto');
      var rules = result.rules && result.rules.length ? result.rules : [
        { state: 'overheat', color: 'red', mode: 'fast' },
        { state: 'booting', color: 'red+green', mode: 'fast' },
        { state: 'upgrading', color: 'green', mode: 'fast' },
        { state: 'wifi_off', color: 'green+blue', mode: 'steady' },
        { state: 'plugin', color: 'red+green', mode: 'steady' },
        { state: 'usb', color: 'red+blue', mode: 'steady' },
        { state: 'offline', color: 'red', mode: 'steady' },
        { state: 'online', color: 'blue', mode: 'fast' }
      ];
      rules.forEach(addRule);
      syncFields();
    }).catch(function (error) { notify(error.message, false); });
  }

  function natPage() {
    page('NAT 设置', '<p class="seniorManagement_info_p native-advanced-description">转换路由器 NAT 模式</p><div class="native-nat-options"><span>模式</span><button type="button" data-nat="nat1"><i></i>NAT1 模式</button><button type="button" data-nat="default"><i></i>默认模式</button><select id="nat-type" class="native-hidden"><option value="default">默认</option><option value="nat1">NAT1</option></select></div>' + buttons(['nat-save', '保存']));
    function syncNat() { document.querySelectorAll('[data-nat]').forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-nat') === value('nat-type')); }); }
    document.querySelectorAll('[data-nat]').forEach(function (button) { bindClick(button, function () { set('nat-type', button.getAttribute('data-nat')); syncNat(); }); });
    bindClick('#nat-save', function () { busy(this, rpc('set_nat_type', { type: value('nat-type') }), 'NAT 设置已保存').then(function () { reloadView(); }); });
    rpc('get_nat_type', {}).then(function (result) { set('nat-type', result.type); syncNat(); }).catch(function (error) { notify(error.message, false); });
  }

  function systemPage() {
    page('系统信息', section('设备信息', row('主机名', '<div id="sys-hostname" class="native-value">读取中…</div>') + row('固件版本', '<div id="sys-firmware" class="native-value">读取中…</div>') + row('Temperature', '<div id="sys-temperature" class="native-value">读取中…</div>') + row('内核版本', '<div id="sys-kernel" class="native-value">读取中…</div>')));
    rpc('get_system_overview', {}).then(function (result) {
      id('sys-hostname').textContent = result.hostname || '未知'; id('sys-firmware').textContent = result.firmware || '未知'; id('sys-kernel').textContent = result.kernel || '未知';
      var wifi = asArray(result.wifi).filter(function (item) { return item != null; });
      id('sys-temperature').textContent = 'CPU: ' + (result.cpu == null ? '--' : Number(result.cpu).toFixed(1)) + '°C' + (wifi.length ? ', WiFi: ' + wifi.map(function (item) { return Number(item).toFixed(1) + '°C'; }).join(' ') : '');
    }).catch(function (error) { notify(error.message, false); });
  }

  function firewallPage() {
    page('防火墙设置', '<p class="seniorManagement_info_p native-advanced-description">配置 WAN 区域的基础防护策略。</p>' + row('启用 SYN-flood 防御', toggle('fw-synflood', '')) + row('丢弃无效数据包', toggle('fw-invalid', '')) + row('暴露至公网', toggle('fw-expose', ''), '危险：开启后公网可以直接访问路由器服务，请自行承担安全风险。') + '<div id="fw-danger" class="native-warning" style="display:none">开启后 WAN 入站及转发策略会变为接受，管理界面和路由器服务可能暴露到公网。</div>' + buttons(['fw-save', '保存']));
    function syncWarning() { show('#fw-danger', checked('fw-expose')); }
    id('fw-expose').addEventListener('change', syncWarning);
    bindClick('#fw-save', function () { var expose = checked('fw-expose'); if (expose && !window.confirm('确认将路由器暴露至公网？这会显著降低安全性。')) return; busy(this, rpc('set_firewall_settings', { synflood: checked('fw-synflood') ? 1 : 0, drop_invalid: checked('fw-invalid') ? 1 : 0, expose: expose ? 1 : 0, confirm: expose ? 1 : 0 }), '防火墙设置已保存'); });
    rpc('get_firewall_settings', {}).then(function (result) { check('fw-synflood', result.synflood); check('fw-invalid', result.drop_invalid); check('fw-expose', result.expose); syncWarning(); }).catch(function (error) { notify(error.message, false); });
  }

  var style = document.createElement('style');
  style.textContent = '\
    *{box-sizing:border-box}html,body{min-height:100%;margin:0!important;background:#fff!important;color:#333!important;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif;font-size:14px}\
    .native-page{width:100%;padding:0 5% 70px;background:#fff}.native-card{width:100%;max-width:1080px;margin:0 auto;background:#fff;border:0;border-radius:0;padding:0;box-shadow:none}\
    .native-card>h1{margin:0;padding:48px 0 18px;border-bottom:1px solid #eee;color:#333;font-size:18px;line-height:25px;font-weight:550}.native-section{margin:0;padding:0;border:0;border-radius:0;overflow:visible}.native-section h2{margin:46px 0 24px;padding:0 0 18px;border-bottom:1px solid #eee;background:transparent;color:#333;font-size:18px;line-height:25px;font-weight:550}\
    .native-row{display:grid;grid-template-columns:122px minmax(260px,390px);column-gap:20px;align-items:start;min-height:46px;margin:15px 0;padding:0}.native-row>label{padding-top:12px;color:#999;font-size:14px;line-height:22px;font-weight:500}.native-control{min-width:0;color:#555}.native-control>input:not(.cbi-input-text),.native-control>select:not(.cbi-input-select),.native-control>textarea,.native-grid input,.native-grid select,.native-device-fields input{display:block;width:100%;min-height:46px;padding:10px 38px 10px 12px;border:1px solid #ccc;border-radius:4px;background-color:#fff;color:#555;font-size:14px;line-height:24px;outline:0;box-shadow:none}.native-control>select:not(.cbi-input-select),.native-grid select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,#9aa0aa 50%),linear-gradient(135deg,#9aa0aa 50%,transparent 50%);background-position:calc(100% - 18px) 20px,calc(100% - 13px) 20px;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.native-control>input:not(.cbi-input-text):focus,.native-control>select:not(.cbi-input-select):focus,.native-control>textarea:focus,.native-grid input:focus,.native-grid select:focus,.native-device-fields input:focus{border-color:#4762fe;box-shadow:0 0 0 2px rgba(71,98,254,.08)}\
    .native-grid,.native-grid-3{display:block}.native-grid .native-row,.native-grid-3 .native-row{grid-template-columns:122px minmax(260px,390px);gap:20px}.native-actions{display:flex;align-items:center;gap:12px;margin:20px 0 0 142px}.native-actions button,.native-toolbar button,.native-device button,.native-list-row button{height:44px;min-width:104px;padding:0 22px;border:0;border-radius:4px;cursor:pointer;font-size:15px;line-height:44px;outline:0}.native-actions .native-primary{width:390px}.native-primary{background:#4762fe;color:#fff}.native-primary:hover{background:#3852e9}.native-secondary{background:#f2f3f6;color:#555}.native-danger{background:#fff;color:#e45a62;border:1px solid #e8a0a5!important}.native-actions button:disabled{opacity:.55;cursor:default}\
    .native-password{display:flex;position:relative}.native-password input{padding-right:48px!important}.native-password button{position:absolute;right:0;top:0;width:46px;height:46px;border:0;background:transparent;border-radius:0;cursor:pointer}.native-password button img{width:20px;height:20px;object-fit:contain;opacity:.72}\
    .native-message{display:none;position:sticky;top:8px;z-index:80;max-width:1080px;margin:0 auto 14px;padding:12px 18px;border-radius:4px}.native-success{display:block;background:#effaf4;color:#197245;border:1px solid #bce7cf}.native-error{display:block;background:#fff3f3;color:#b62e3a;border:1px solid #efc5c8}.native-help{margin:7px 0 0;color:#999;font-size:12px;line-height:20px}.native-warning{max-width:650px;margin:18px 0;padding:13px 16px;border-left:3px solid #f5a623;background:#fff8e8;color:#8b650d;line-height:22px}.native-status{max-width:650px;margin:18px 0;padding:13px 16px;background:#f7f8fb;color:#666;line-height:1.8}.native-toolbar{display:flex;justify-content:space-between;align-items:center;margin:28px 0 16px;padding-bottom:18px;border-bottom:1px solid #eee;color:#999}\
    .native-device-list,.native-list{display:block;margin-top:18px;border-top:1px solid #eee}.native-device{display:grid;grid-template-columns:minmax(210px,1fr) minmax(520px,1.8fr);gap:24px;align-items:center;margin:0;padding:20px 0;border:0;border-bottom:1px solid #eee;border-radius:0}.native-device-main{display:flex;flex-direction:column;gap:5px}.native-device-main strong{color:#333;font-size:17px;font-weight:550}.native-device-main code,.native-list-row code{font-family:ui-monospace,SFMono-Regular,monospace;color:#888}.native-device-main small{color:#999}.native-device-fields{display:grid;grid-template-columns:minmax(130px,1fr) auto 105px 105px auto;gap:9px;align-items:center}.native-device-fields input{min-height:40px;padding:8px 10px}.native-list-row{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:70px;padding:14px 0;border:0;border-bottom:1px solid #eee;border-radius:0}.native-list-row span{display:flex;flex-direction:column;gap:4px;color:#333}.native-list-row>div{display:flex;gap:8px}.native-empty{text-align:center;color:#999;padding:38px 0}textarea{resize:vertical}\
    @media(max-width:900px){.native-page{padding:0 20px 50px}.native-card>h1{padding-top:30px}.native-row,.native-grid .native-row,.native-grid-3 .native-row{grid-template-columns:1fr;gap:6px}.native-row>label{padding-top:0}.native-actions{margin-left:0}.native-actions .native-primary{width:auto;min-width:150px}.native-device{grid-template-columns:1fr}.native-device-fields{grid-template-columns:1fr 1fr}.native-list-row{align-items:flex-start}.native-toolbar{gap:12px}.native-section h2{margin-top:34px}}';
  document.head.appendChild(style);

  var oemStyle = document.createElement('style');
  oemStyle.textContent = '\
    html,body{margin:0!important;background:#fff!important;color:#333!important;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif!important}.native-page{width:100%;padding:0!important;background:#fff!important}.native-card{width:auto!important;max-width:none!important;margin:0!important;background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important}.native-router{margin:5%!important}.native-management,.native-advanced{padding:44px 60px!important}.native-page-title{margin-top:15px!important;margin-bottom:11px!important}.native-section{margin-top:50px!important}.native-section-title{margin:0 15px 11px 0!important;padding:5px!important}.native-section-title .title-one{display:inline-block;margin:0 0 20px!important}.native-card>.title,.native-advanced>.seniorManagement_top{margin:0 0 30px!important;padding:0 0 20px!important;border-bottom:1px solid #eee!important;font-size:18px!important;font-weight:550!important;color:#333!important}\
    .native-row{display:flex!important;align-items:flex-start!important;width:100%!important;min-height:46px!important;margin:15px 15px 11px 0!important;padding:5px!important}.native-row>div:first-child{flex:0 0 16.66666667%!important;max-width:16.66666667%!important;height:46px!important;padding:0 12px 0 15px!important;line-height:44px!important}.native-row>div:first-child span{color:#999!important;font-size:14px!important;font-weight:500!important;line-height:44px!important}.native-row>.native-control{position:relative!important;flex:0 0 33.33333333%!important;max-width:33.33333333%!important;padding:0 15px!important;color:#555!important}.native-grid,.native-grid-3{display:block!important}.native-control>input:not(.cbi-input-text),.native-control>textarea,.native-password>input:not(.cbi-input-text){display:block!important;width:100%!important;height:46px!important;min-height:46px!important;padding:10px 12px!important;border:1px solid #ccc!important;border-radius:4px!important;background:#fff!important;color:#555!important;font-size:14px!important;line-height:24px!important;outline:0!important;box-shadow:none!important}.native-control>textarea{height:auto!important;min-height:260px!important}.native-control>input:not(.cbi-input-text):focus,.native-control>textarea:focus{border-color:#ccc!important;box-shadow:none!important}\
    .native-select{position:relative;width:100%;height:46px}.native-select>select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}.native-select-face{display:flex!important;align-items:center!important;justify-content:space-between!important;width:100%!important;height:46px!important;padding:6px 16px 6px 12px!important;border:1px solid #ccc!important;border-radius:4px!important;background:#fff!important;color:#555!important;font-size:14px!important;text-align:left!important;cursor:pointer!important}.native-select-face i{width:9px;height:9px;border-right:2px solid #aaa;border-bottom:2px solid #aaa;transform:rotate(45deg) translateY(-3px)}.native-select.open .native-select-face i{transform:rotate(225deg) translate(-2px,-2px)}.native-select-options{display:none;position:absolute;left:0;right:0;top:50px;z-index:60;padding:6px 0;border:1px solid #ddd;border-radius:4px;background:#fff;box-shadow:0 5px 16px rgba(0,0,0,.12)}.native-select.open .native-select-options{display:block}.native-select-options button{display:block;width:100%;height:40px;padding:0 12px;border:0;background:#fff;color:#555;text-align:left;cursor:pointer}.native-select-options button:hover{background:#f4f6fa;color:#4762fe}\
    .native-password{position:relative!important;width:100%!important}.native-password input{padding-right:46px!important}.native-password button{position:absolute!important;right:1px!important;top:1px!important;width:44px!important;height:44px!important;border:0!important;background:#fff!important;cursor:pointer!important}.native-password button img{width:20px!important;height:20px!important;opacity:1!important}.native-actions{display:flex!important;align-items:center!important;gap:12px!important;width:33.33333333%!important;margin:20px 0 0 16.66666667%!important;padding:0 15px!important}.native-actions button{width:100%!important;height:46px!important;min-width:0!important;padding:0 16px!important;border-radius:4px!important;font-size:14px!important;line-height:46px!important}.native-primary{border:1px solid #4762fe!important;background:#4762fe!important;color:#fff!important}.native-secondary{border:1px solid #ddd!important;background:#f4f6fa!important;color:#666!important}.native-danger{height:34px!important;line-height:32px!important;padding:0 12px!important;border:1px solid #4762fe!important;background:#fff!important;color:#4762fe!important;border-radius:4px!important}\
    .native-status,.native-warning{width:50%;max-width:none!important;margin:18px 0 18px 16.66666667%!important;padding:12px 15px!important;background:#f4f6fa!important;border:0!important;color:#999!important;line-height:24px!important}.native-warning{color:#fb5954!important}.native-help{margin:6px 0 0!important;color:#999!important;font-size:12px!important}.native-message{position:fixed!important;top:30px!important;left:50%!important;z-index:100!important;transform:translateX(-50%)!important;width:auto!important;min-width:240px!important;margin:0!important;padding:12px 24px!important;border:0!important;border-radius:5px!important;box-shadow:0 4px 18px rgba(0,0,0,.16)!important}.native-wan-info{display:grid;grid-template-columns:1fr 1fr;gap:46px;padding:30px 0 0}.native-wan-info>div{padding:0 18px 20px;border-bottom:1px solid #eee}.native-wan-info h3{margin:0 0 18px;color:#333;font-size:15px}.native-wan-info p{display:flex;margin:8px 0;color:#666;line-height:22px}.native-wan-info p b{display:inline-block;width:95px;color:#999;font-weight:400}\
    .native-device-tools{display:flex;position:absolute;right:60px;top:32px;align-items:center;gap:10px}.native-device-tools button{display:flex;flex-direction:column;align-items:center;border:0;background:transparent;color:#999;font-size:10px;cursor:pointer}.native-device-tools button img{width:33px;height:33px;object-fit:contain}.native-device-tools button.active{color:#4762fe}.native-device-tools>i{width:1px;height:22px;background:#ddd}.native-device-group{margin-top:30px}.native-device-group h3{margin:0 0 20px;font-size:14px;font-weight:550}.native-table{padding:20px 20px 10px;border:1px solid #ddd;color:#999}.native-table ul{display:flex;align-items:center;margin:0;padding:0;list-style:none}.native-table li{float:none!important;width:20%;padding-right:10px;list-style:none}.native-table-head{padding-bottom:10px!important;border-bottom:1px solid #eee;font-weight:550}.native-table-row{min-height:64px;padding:13px 0;border-bottom:1px solid #eee;color:#333}.native-table-row:last-child{border-bottom:0}.native-table-row .name{width:25%!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.native-table-row li:nth-child(4){width:15%!important}.native-table-row code,.native-table-row small{display:block;margin-top:4px;color:#999;font-family:inherit;font-size:12px}.native-table-row .edit{height:30px!important;line-height:26px!important;background:#fff!important}.status-dot{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%}.status-dot.online{background:#45c485}.status-dot.offline{background:#999}.native-empty{padding:22px 0!important;text-align:center!important;color:#bbb!important}\
    .native-modal-mask{display:none;position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.3)}.native-modal-mask.open{display:block}.native-modal{display:none;position:fixed;top:35px;left:50%;z-index:91;width:564px;padding:30px 40px;border:1px solid #eee;border-radius:20px;background:#fff;transform:translateX(-50%)}.native-modal.open{display:block}.native-modal-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid #eee;font-size:18px}.native-modal-close{border:0;background:transparent;cursor:pointer}.native-modal-close img{width:18px}.native-modal-body{padding-top:10px}.native-modal .native-row{margin:8px 0!important}.native-modal .native-row>div:first-child{flex:0 0 120px!important;max-width:120px!important;padding-left:0!important}.native-modal .native-row>.native-control{flex:1!important;max-width:none!important}.native-modal .native-actions{width:360px!important;margin:15px auto 0!important;padding:0!important}\
    .native-list{margin-top:20px!important;border:1px solid #ddd!important;padding:10px 20px!important}.native-list-row{min-height:58px!important;padding:10px 0!important;border-bottom:1px solid #eee!important}.native-list-row:last-child{border-bottom:0!important}.native-toolbar{margin:20px 0!important}.native-advanced .native-section,.native-management .native-section{margin-top:30px!important}.native-advanced .native-section:first-child,.native-management .native-section:first-child{margin-top:0!important}.native-add-button{display:block;width:300px;height:46px;margin-top:20px;border:1px solid #4762fe;border-radius:4px;background:#4762fe;color:#fff;cursor:pointer}.native-static-table{margin-top:20px}.native-static-table li{float:none!important}.native-static-table .edit{margin-right:5px}.native-advanced-table{margin-top:20px}.native-advanced-table li{float:none!important;flex:1;width:auto!important}.native-advanced-table .edit{margin-right:4px}.native-hand-button{display:block;width:175px;height:46px;margin-top:20px;border:1px solid #ddd;border-radius:4px;background:#f4f6fa;color:#666;cursor:pointer}.native-pf-table ul{min-width:760px}.native-pf-table{overflow-x:auto}.native-advanced-description{margin:0 0 20px!important;color:#999!important;font-size:14px!important}.native-hosts-box{width:100%;margin:20px 0;border:1px solid #ddd}.native-hosts-box textarea{display:block;width:100%;min-height:300px;padding:20px;border:0;outline:0;resize:none;line-height:24px}.native-hosts-box>div{margin:0 20px;padding:15px 0;border-top:1px solid #eee;color:#999;font-size:12px}.native-hosts-box p{margin:4px 0}.native-nat-options{display:flex;align-items:center;gap:28px;margin:30px 0}.native-nat-options>span{width:120px;color:#999}.native-nat-options button{display:flex;align-items:center;border:0;background:transparent;color:#666;cursor:pointer}.native-nat-options button i{width:16px;height:16px;margin-right:8px;border:1px solid #bbb;border-radius:50%}.native-nat-options button.active i{border:5px solid #4762fe}.native-nat-options button.active{color:#4762fe}\
    @media(max-width:760px){.native-router{margin:24px!important}.native-management,.native-advanced{padding:28px 24px!important}.native-row{display:block!important}.native-row>div:first-child,.native-row>.native-control{width:100%!important;max-width:none!important;flex:none!important}.native-actions{width:100%!important;margin-left:0!important}.native-status,.native-warning{width:100%;margin-left:0!important}.native-device-tools{position:static;justify-content:flex-end;margin-top:-48px}.native-table{overflow-x:auto}.native-table ul{min-width:760px}.native-modal{top:10px;width:calc(100% - 20px);padding:24px}.native-modal .native-row>div:first-child{max-width:none!important}.native-modal .native-actions{width:100%!important}}';
  document.head.appendChild(oemStyle);

  var oemDeviceIdentityStyle = document.createElement('style');
  oemDeviceIdentityStyle.textContent = '\
    .native-device-table{overflow-x:auto}.native-device-table ul{min-width:1120px}.native-device-table .col-device-name{width:18%!important}.native-device-table .col-device-address{width:18%!important}.native-device-table .col-device-type{width:14%!important}.native-device-table .col-device-vendor{width:17%!important}.native-device-table .col-device-status{width:13%!important}.native-device-table .col-device-speed{width:12%!important}.native-device-table .col-device-actions{width:8%!important;padding-right:0}.native-device-table .col-device-type,.native-device-table .col-device-vendor{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.native-device-table .native-table-row .name{width:18%!important}.native-device-table .native-table-row li:nth-child(4){width:17%!important}';
  document.head.appendChild(oemDeviceIdentityStyle);

  var oemAccessStyle = document.createElement('style');
  oemAccessStyle.textContent = '\
    .native-hidden{display:none!important}.native-access-mode{display:flex;align-items:center;width:100%;height:46px;margin:30px 0 24px}.native-access-label{display:flex;align-items:center;width:120px;height:100%;color:#999}.native-access-options{display:flex;align-items:center;flex:1;height:100%;gap:10px}.native-access-options button{display:flex;align-items:center;justify-content:center;width:300px;height:46px;border:1px solid #ddd;border-radius:4px;background:#fff;color:#666;cursor:pointer}.native-access-options button i{display:inline-block;width:16px;height:16px;margin-right:10px;border:1px solid #bbb;border-radius:50%}.native-access-options button.active{border-color:#4762fe;color:#4762fe}.native-access-options button.active i{border:5px solid #4762fe}.native-access-list{margin-top:38px;padding-top:24px;border-top:1px solid #eee}.native-access-list h3{margin:0 0 20px;font-size:14px;font-weight:550}.native-access-actions{display:flex;gap:12px;margin-top:20px}.native-access-actions button{width:175px;height:46px;border:1px solid #ddd;border-radius:4px;background:#f4f6fa;color:#666;cursor:pointer}.native-plain-select{display:block;width:100%;height:46px;padding:6px 12px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#555}.native-access-list .native-table li{float:none!important}.native-access-list .native-table-row{min-height:54px}\
    @media(max-width:760px){.native-access-mode{display:block;height:auto}.native-access-label{width:100%;height:38px}.native-access-options{display:block;height:auto}.native-access-options button{width:100%;margin-bottom:10px}.native-access-actions button{flex:1}}';
  document.head.appendChild(oemAccessStyle);

  var oemRejectedStyle = document.createElement('style');
  oemRejectedStyle.textContent = '\
    .native-rejected-actions{justify-content:flex-end;margin:0 0 16px}.native-rejected-actions button{min-width:110px}.native-rejected-table{margin-top:22px;overflow-x:auto}.native-rejected-table>ul,.native-rejected-table>#rejected-list>ul{min-width:1180px}.native-rejected-table .native-table-row{min-height:76px}.native-rejected-table .native-table-row li{overflow:hidden;text-overflow:ellipsis}.native-rejected-table small{display:block;margin-top:6px;color:#999}.native-rejected-table .edit{display:block;width:100%;min-height:28px;margin:2px 0;padding:0 4px;white-space:nowrap}';
  document.head.appendChild(oemRejectedStyle);

  var nativeFixStyle = document.createElement('style');
  nativeFixStyle.textContent = '\
    .native-internet-info{display:flex!important;width:100%!important;padding-top:40px!important}.native-internet-info>div{width:50%!important;padding:0 10px!important}.native-internet-info .ipv4_info_title,.native-internet-info .ipv6_info_title{display:flex!important;align-items:center!important;height:35px!important;padding-bottom:10px!important;color:#333!important;font-size:16px!important;font-weight:500!important}.native-internet-info .ipv4_info_item,.native-internet-info .ipv6_info_item{display:flex!important;align-items:flex-start!important;padding:15px 0!important}.native-internet-info .ipv4_info_item_left,.native-internet-info .ipv6_info_item_left{flex-shrink:0!important;width:120px!important;color:#999!important;font-size:14px!important;font-weight:500!important}.native-internet-info .ipv4_info_item_right,.native-internet-info .ipv6_info_item_right{flex:1!important;color:#333!important;font-size:14px!important;font-weight:500!important;overflow-wrap:anywhere!important}.native-internet-info .ipv6_info_empty{display:none;align-items:center;justify-content:center;width:100%;min-height:260px;color:#333;font-weight:500}\
    @media(max-width:760px){.native-internet-info{display:block!important}.native-internet-info>div{width:100%!important;padding:0!important}.native-internet-info .ipv6_info{margin-top:28px!important}}';
  document.head.appendChild(nativeFixStyle);

  var mainRouterPanelStyle = document.createElement('style');
  mainRouterPanelStyle.textContent = '\
    .native-settings-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:24px!important;margin-top:30px!important}.native-settings-panel{min-width:0;padding:24px 26px;border:1px solid #e5e7ec;border-radius:10px;background:#fff}.native-settings-panel h2{margin:0 0 22px;padding:0 0 16px;border-bottom:1px solid #eee;font-size:17px;font-weight:550}.native-settings-panel .native-row{margin:10px 0!important;padding:0!important}.native-settings-panel .native-row>div:first-child{flex:0 0 38%!important;max-width:38%!important;padding-left:0!important}.native-settings-panel .native-row>.native-control{flex:0 0 62%!important;max-width:62%!important;padding:0!important}.native-settings-panel .native-actions{width:62%!important;margin:20px 0 0 38%!important;padding:0!important}.native-settings-wide{margin-top:24px}.native-settings-wide .native-row>div:first-child{flex-basis:20%!important;max-width:20%!important}.native-settings-wide .native-row>.native-control{flex-basis:50%!important;max-width:50%!important}.native-settings-wide .native-actions{width:50%!important;margin-left:20%!important}.native-info{margin:18px 0 0;padding:13px 16px;border-radius:6px;background:#f7f8fb;color:#777;line-height:1.75}.native-value{display:flex;align-items:center;min-height:46px;overflow-wrap:anywhere;color:#555}.native-settings-panel .native-status{width:100%!important;margin:18px 0 0!important}.native-check-line{display:flex;align-items:center;gap:28px;margin:0 0 18px}.native-inline-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.native-inline-control button,.native-inline-actions button,.native-link-button{height:46px;padding:0 18px;border:1px solid #ddd;border-radius:4px;cursor:pointer}.native-inline-actions{display:flex;gap:12px;margin-top:22px}.native-link-button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}.native-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px 24px}.native-meta>div{min-width:0;padding:0 0 14px;border-bottom:1px solid #eee}.native-meta small,.native-meta span{display:block}.native-meta small{margin-bottom:7px;color:#999}.native-meta span{color:#333;line-height:1.5;overflow-wrap:anywhere}.native-log{max-height:340px;min-height:120px;margin:0;padding:18px;border-radius:6px;background:#f7f8fb;color:#555;overflow:auto;white-space:pre-wrap;line-height:1.7}.native-auth-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 28px}.native-auth-grid .native-row{display:block!important}.native-auth-grid .native-row>div:first-child,.native-auth-grid .native-row>.native-control{width:100%!important;max-width:none!important;flex:none!important;padding:0!important}.native-auth-grid .native-row>div:first-child{height:34px!important;line-height:32px!important}.native-auth-grid .native-row>div:first-child span{line-height:32px!important}\
    @media(max-width:900px){.native-settings-grid{grid-template-columns:1fr!important}.native-settings-panel{padding:20px}.native-settings-wide{margin-top:18px}.native-settings-panel .native-row{display:block!important}.native-settings-panel .native-row>div:first-child,.native-settings-panel .native-row>.native-control{width:100%!important;max-width:none!important;flex:none!important}.native-settings-panel .native-actions,.native-settings-wide .native-actions{width:100%!important;margin-left:0!important}.native-auth-grid{grid-template-columns:1fr}.native-check-line{align-items:flex-start;flex-direction:column;gap:4px}.native-meta{grid-template-columns:1fr}.native-inline-actions{flex-wrap:wrap}}';
  document.head.appendChild(mainRouterPanelStyle);

  function start() {
    if (/wifi\.html$/.test(path)) wifiPage();
    else if (/guest_content\.html$/.test(path)) guestPage();
    else if (/localnet\.html$/.test(path)) localPage();
    else if (/led\.html$/.test(path)) ledPage();
    else if (/system\.html$/.test(path)) systemPage();
    else if (/internet\.html$/.test(path)) internetPage();
    else if (/iptv\.html$/.test(path)) iptvPage();
    else if (/deviceList\.html$/.test(path)) devicesPage();
    else if (/access\.html$/.test(path)) accessPage();
    else if (/rejected\.html$/.test(path)) rejectedPage();
    else if (/management\/dhcp\.html$/.test(path)) dhcpPage();
    else if (/qosLimit\.html$/.test(path)) qosPage();
    else if (/DDNS\.html$/.test(path)) ddnsPage();
    else if (/Certificates\.html$/.test(path)) certificatesPage();
    else if (/portForward\.html$/.test(path)) portPage();
    else if (/DMZ\.html$/.test(path)) dmzPage();
    else if (/UPnP\.html$/.test(path)) upnpPage();
    else if (/CustomHosts\.html$/.test(path)) hostsPage();
    else if (/NATSet\.html$/.test(path)) natPage();
    else if (/Firewall\.html$/.test(path)) firewallPage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
