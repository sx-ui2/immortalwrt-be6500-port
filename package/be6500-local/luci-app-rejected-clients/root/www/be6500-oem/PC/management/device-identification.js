(function ($) {
    "use strict";

    var devices = {};
    var refreshTimer = null;

    function normalizedMac(value) {
        var match = String(value || "").toUpperCase().match(/[0-9A-F]{2}(?::[0-9A-F]{2}){5}/);
        return match ? match[0] : "";
    }

    function applyIdentityColumns() {
        $(".online_table .data ul, .offline_table .data ul").each(function () {
            var row = $(this);
            var mac = normalizedMac(row.children("li").eq(1).text());
            var info = devices[mac] || {};
            var type = info.device_type || "其他设备";
            var vendor = info.vendor || info.brand || "暂未识别";
            var typeCell = row.children(".device-type");
            var vendorCell = row.children(".device-vendor");
            if (!typeCell.length) typeCell = $("<li>", { "class": "device-type" }).appendTo(row);
            if (!vendorCell.length) vendorCell = $("<li>", { "class": "device-vendor" }).appendTo(row);
            typeCell.attr("title", type).text(type);
            vendorCell.attr("title", vendor).text(vendor);
        });
    }

    function scheduleApply() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(applyIdentityColumns, 0);
    }

    function fetchDeviceIdentity() {
        var session = $.cookie("sessionid") || "";
        $.ajax({
            type: "post",
            url: "/cgi-bin/luci/admin/network/be6500_oem_beta/jdcapi",
            dataType: "json",
            cache: false,
            contentType: "application/json",
            data: JSON.stringify({
                jsonrpc: "2.0",
                id: 108,
                method: "call",
                params: [session, "jdcapi.static", "web_get_device_list", {}]
            }),
            success: function (response) {
                var list = response && response.result && response.result[1]
                    ? response.result[1].device_list || [] : [];
                devices = {};
                $.each(list, function (_, item) {
                    devices[String(item.id || item.uid || "").toUpperCase()] = item;
                });
                scheduleApply();
            }
        });
    }

    $(function () {
        var target = document.querySelector(".list-com");
        if (target && window.MutationObserver) {
            new MutationObserver(scheduleApply).observe(target, {
                childList: true,
                subtree: true
            });
        }
        fetchDeviceIdentity();
        window.setInterval(fetchDeviceIdentity, 5000);
    });
})(window.jQuery);
