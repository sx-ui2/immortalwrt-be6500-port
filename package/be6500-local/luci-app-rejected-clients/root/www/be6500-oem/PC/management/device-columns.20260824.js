(function ($) {
    "use strict";

    var identities = {};
    var applyTimer = null;

    function normalizeMac(value) {
        var match = String(value || "").toUpperCase().match(/[0-9A-F]{2}(?::[0-9A-F]{2}){5}/);
        return match ? match[0] : "";
    }

    function fallbackIdentity(name, mac) {
        var text = String(name || "").toLowerCase();
        var prefix = String(mac || "").replace(/:/g, "").slice(0, 6);
        var info = { device_type: "其他设备", vendor: "暂未识别" };

        if (/xiaomi-airc|airc|air-condition/.test(text)) info.device_type = "空调";
        else if (/tmall|genie/.test(text)) info.device_type = "天猫精灵";
        else if (/iphone|ipad|macbook|\bmac\b/.test(text)) info.device_type = "Apple 设备";
        else if (/camera|chuangmi|hualai/.test(text)) info.device_type = "摄像头 / 智能家居";

        var vendors = {
            "047A0B": "Beijing Xiaomi Electronics",
            "109E3A": "Zhejiang Tmall Technology",
            "B8144D": "Apple",
            "C8BF4C": "Beijing Xiaomi Mobile Software Co., Ltd",
            "E41B43": "Beijing Xiaomi Electronics",
            "E4AAEC": "Tianjin Hualai Technology",
            "FC315D": "Apple"
        };
        if (vendors[prefix]) info.vendor = vendors[prefix];
        return info;
    }

    function ensureHeaders() {
        $(".online_table ul.head, .offline_table ul.head").each(function () {
            var head = $(this);
            if (!head.children(".identity-type-head").length) {
                head.children("li").eq(1).after(
                    $("<li>", { "class": "identity-type-head", text: "设备类型" }),
                    $("<li>", { "class": "identity-vendor-head", text: "品牌 / 厂商" })
                );
            }
        });
    }

    function setCell(cell, value, order, width) {
        cell.attr("title", value).css({
            display: "block",
            order: order,
            width: width,
            minWidth: "0",
            flex: "0 0 " + width
        });
        if (cell.text() !== value) cell.text(value);
    }

    function applyColumns() {
        ensureHeaders();
        $(".online_table .data ul, .offline_table .data ul").each(function () {
            var row = $(this);
            var mac = normalizeMac(row.children("li").eq(1).text());
            var name = row.children("li").eq(0).text();
            var fallback = fallbackIdentity(name, mac);
            var info = identities[mac] || {};
            var type = info.device_type || fallback.device_type;
            var vendor = info.vendor || info.brand || fallback.vendor;
            var typeCell = row.children(".device-type");
            var vendorCell = row.children(".device-vendor");

            if (!typeCell.length) typeCell = $("<li>", { "class": "device-type" }).appendTo(row);
            if (!vendorCell.length) vendorCell = $("<li>", { "class": "device-vendor" }).appendTo(row);
            setCell(typeCell, type, 3, "14%");
            setCell(vendorCell, vendor, 4, "17%");
        });
        window.__deviceIdentityColumnsActive = true;
    }

    function scheduleApply() {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(applyColumns, 20);
    }

    function refreshIdentities() {
        var session = $.cookie("sessionid") || "";
        $.ajax({
            type: "post",
            url: "/cgi-bin/luci/admin/network/be6500_oem_beta/jdcapi",
            dataType: "json",
            cache: false,
            contentType: "application/json",
            data: JSON.stringify({
                jsonrpc: "2.0",
                id: 109,
                method: "call",
                params: [session, "jdcapi.static", "web_get_device_list", {}]
            }),
            success: function (response) {
                var list = response && response.result && response.result[1]
                    ? response.result[1].device_list || [] : [];
                identities = {};
                $.each(list, function (_, item) {
                    identities[String(item.id || item.uid || "").toUpperCase()] = item;
                });
                scheduleApply();
            }
        });
    }

    $(function () {
        var target = document.querySelector(".list-com");
        if (target && window.MutationObserver) {
            new MutationObserver(scheduleApply).observe(target, { childList: true, subtree: true });
        }
        applyColumns();
        refreshIdentities();
        window.setInterval(refreshIdentities, 5000);
    });
})(window.jQuery);
