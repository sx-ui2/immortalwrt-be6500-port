(function ($, h, c) {
    var a = $([]),
        e = $.resize = $.extend($.resize, {}),
        i,
        k = "setTimeout",
        j = "resize",
        d = j + "-special-event",
        b = "delay",
        f = "throttleWindow";
    e[b] = 250;
    e[f] = true;
    $.event.special[j] = {
        setup: function () {
            if (!e[f] && this[k]) {
                return false
            }
            var l = $(this);
            a = a.add(l);
            $.data(this, d, {
                w: l.width(),
                h: l.height()
            });
            if (a.length === 1) {
                g()
            }
        },
        teardown: function () {
            if (!e[f] && this[k]) {
                return false
            }
            var l = $(this);
            a = a.not(l);
            l.removeData(d);
            if (!a.length) {
                clearTimeout(i)
            }
        },
        add: function (l) {
            if (!e[f] && this[k]) {
                return false
            }
            var n;

            function m(s, o, p) {
                var q = $(this),
                    r = $.data(this, d);
                r.w = o !== c ? o : q.width();
                r.h = p !== c ? p : q.height();
                n.apply(this, arguments)
            }
            if ($.isFunction(l)) {
                n = l;
                return m
            } else {
                n = l.handler;
                l.handler = m
            }
        }
    };

    function g() {
        i = h[k](function () {
            a.each(function () {
                var n = $(this),
                    m = n.width(),
                    l = n.height(),
                    o = $.data(this, d);
                if (m !== o.w || l !== o.h) {
                    n.trigger(j, [o.w = m, o.h = l])
                }
            });
            g()
        },
            e[b])
    }
})(jQuery, this);

window.onload = function () {
    var height = $("html").height();
    setTimeout("iframe_height(" + height + ")", 500);
}
$("html").resize(function () {
    var height = $("html").height();
    iframe_height(height);
})
$(window).resize(function () {
    var height = $("html").height();
    iframe_height(height);
})
function iframe_height(height) {
    var min_height = $(window).height();
    var other_height = $("html").find(".internet_setting").length > 0 ? 80 : 0;
    var iframe_min_height = $("html").find(".router-mesh-content").length > 0 ? (height + other_height) : 750;
    $("html").css("min_height", min_height);
    window.parent.setHeight((height + other_height), iframe_min_height);
}

function isDomainFn(str) {
    var domain = str.split('.');
    if (domain.length <= 1) {
        return false;
    }
    var regExp = new RegExp(/^[0-9a-zA-Z@._-]+$/);
    for (var i in domain) {
        if (!regExp.test(domain[i]))
            return false;
    }
    if (!isNaN(Number(domain[domain.length - 1][0])))
        return false;
    return true;
}

function checkCharN(Message) { //字节统计
    var ByteCount = 0;
    var StrLength = Message.length;
    for (var i = 0; i < StrLength; i++) {
        ByteCount = (Message.charCodeAt(i) < 128) ? ByteCount + 1 : ByteCount + 3;
    }
    return ByteCount;
}

function format_volide() {
    var requires = $("div").find('.requireIndependent');
    for (var i = 0; i < requires.length; i++) {
        var _this = requires[i];
        if ($(_this).is(":visible") && $(_this).attr('disabled') != 'disabled') {
            $(_this).trigger('blur');
            if ($(_this).hasClass('borError')) {
                return false;
            }
        }
    }
    return true;
}

function trimToMaxLength(input_val) {
    var new_val = input_val
    var max_len = checkCharN(new_val);
    if (max_len > 63) {
        new_val = new_val.slice(0, -1);
        return trimToMaxLength(new_val);
    }
    return new_val;
}

// 转义特殊字符
function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function(match) {
      switch (match) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return match;
      }
    });
}
  
// 反转义特殊字符
function unescapeHTML(str) {
    return String(str).replace(/&(amp|lt|gt|quot|#39);/g, function(match, entity) {
      switch (entity) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case '#39':
          return "'";
        default:
          return match;
      }
    });
}

function DeviceVolide() {
    var requires = $("div").find('.requireIndependent');
    requires.keyup(function () {
        var this_obj = $(this);
        var ByteCount, $parent, tmp_id, dhcpIsChecked;
        var isHasDhcpWrapperClass = this_obj.closest('.dhcp_wrapper').length;
        if (isHasDhcpWrapperClass) {
            const imgElement = this_obj.closest('ul').find('.choice-btn img');
            if (imgElement.length > 0) {
                dhcpIsChecked = imgElement.attr('data-status');
            } else {
                dhcpIsChecked = '1';
            }
        }
        if (this_obj.hasClass('doubleDeck')) {
            $parent = this_obj.parent().parent().parent();
            tmp_id = $parent.attr("id");
        } else if (this_obj.hasClass('threeLayers')) {
            $parent = this_obj.parent().parent().parent().parent();
            tmp_id = $parent.attr("id");
        } else if (this_obj.hasClass('twoLayers')) {
            $parent = this_obj.parent().parent();
            tmp_id = $parent.attr("id");
        } else {
            $parent = this_obj.parent();
            tmp_id = this_obj.attr("id");
        }
        this_obj.removeClass('borError');

        //包含 isDName
        if (this_obj.hasClass('isDName')) {
            const DNameRegError = /^[0-9A-Za-z\u4e00-\u9fa5~!@#%^&*()_+={}|:<> ?`[\]\\;/,.\-"'-：；–（）—‘’“”…～、？！，。【】｛｝｜《》￥·｀€£¥￥]*$/;
            const specialRegError = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/ig;
            ByteCount = checkCharN($.trim(this_obj.val()));
            if (isHasDhcpWrapperClass) {
                if (dhcpIsChecked === '1' && ((this_obj.closest('.device_wrapper').length < 1 && ByteCount < 1) || !DNameRegError.test($.trim(this_obj.val())) || specialRegError.test($.trim(this_obj.val())))) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            } else {
                if ((this_obj.closest('.device_wrapper').length < 1 && ByteCount < 1) || !DNameRegError.test($.trim(this_obj.val())) || specialRegError.test($.trim(this_obj.val()))) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            }
        }

        //包含 isPortTranspondName
        if (this_obj.hasClass('isPortTranspondName')) {
            var regError = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
            ByteCount = checkCharN($.trim(this.value));
            if ($.trim(this_obj.val()) == '' || $.trim(this_obj.val()).match(/^[ ]*$/) || !regError.test($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isNaNSpeed
        if (this_obj.hasClass('isNaNSpeed')) {
            var regError = /^$|^[]{0,1}(\d+)$/;
            if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 0) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isPortNum
        if (this_obj.hasClass('isPortNum')) {
            var regError = /(^[1-9]\d*$)/;
            if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 0 || parseInt($.trim(this_obj.val())) > 65535) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isIPAddr
        if (this_obj.hasClass('isIPAddr')) {
            const regError = /^$|^[]{0,1}(\d+)$/;
            if (isHasDhcpWrapperClass) {
                if (dhcpIsChecked === '1' && ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 1 || parseInt($.trim(this_obj.val())) > 254)) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            } else {
                if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 1 || parseInt($.trim(this_obj.val())) > 254) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            }
        }

        //包含 isIPAddrExpand
        if (this_obj.hasClass('isIPAddrExpand')) {
            const regError = /^$|^[]{0,1}(\d+)$/;
            let start = "";
            let end = "";
            if (this_obj.attr("id") == "DMZIpAddr") {
                start = this_obj;
                end = this_obj.siblings('input');
            }
            if (this_obj.attr("id") == "DMZIpAddrTwo") {
                start = this_obj.siblings('input');
                end = this_obj;
            }
            const start_val = $.trim(start.val())
            const end_val = $.trim(end.val())

            if (isHasDhcpWrapperClass) {
                if (
                    dhcpIsChecked === '1' && 
                    (start_val == '' || 
                    end_val == '' || 
                    !regError.test(start_val) || 
                    !regError.test(end_val) || 
                    parseInt(start_val) < 0 || 
                    parseInt(start_val) > 255 ||
                    parseInt(end_val) < 0 || 
                    parseInt(end_val) > 255 ||
                    (start_val == 0 && end_val == 0) ||
                    (start_val == 255 && end_val == 255))
                ) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            } else {
                if (
                    start_val == '' || 
                    end_val == '' || 
                    !regError.test(start_val) || 
                    !regError.test(end_val) || 
                    parseInt(start_val) < 0 || 
                    parseInt(start_val) > 255 ||
                    parseInt(end_val) < 0 || 
                    parseInt(end_val) > 255 ||
                    (start_val == 0 && end_val == 0) ||
                    (start_val == 255 && end_val == 255)
                ) {
                    if ($("." + tmp_id).html() == undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            }
        }

        //包含 isMacAddr
        if (this_obj.hasClass('isMacAddr')) {
            var regError = /^(?!ff:ff:ff:ff:ff:ff$)(?!00:00:00:00:00:00$)(?:[A-Fa-f\d]{2}:){5}[A-Fa-f\d]{2}$/;
            var HostMac = $.cookie("HostMac") || '';
            var inputValue = $.trim(this_obj.val());
            var isInvalidMac = inputValue === '' || !regError.test(inputValue);
            var isSameAsHostMac = inputValue.toLowerCase() === HostMac.toLowerCase();
            var hasParentWithClass = this_obj.closest('.access_wrapper').length;
        
            if (isHasDhcpWrapperClass) {
                if (dhcpIsChecked === '1' && (isInvalidMac || (hasParentWithClass > 0 && isSameAsHostMac))) {
                    if ($("." + tmp_id).html() === undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            } else {
                if (isInvalidMac || (hasParentWithClass > 0 && isSameAsHostMac)) {
                    if ($("." + tmp_id).html() === undefined) {
                        $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                    }
                    this_obj.addClass('borError');
                    return false;
                }
            }
        }
        
        //包含 isDomain
        if (this_obj.hasClass('isDomain')) {
            if ($.trim(this_obj.val()) == '' || !isDomainFn($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isRightWholeNum 正整数
        if (this_obj.hasClass('isRightWholeNum')) {
            var regError = /^[1-9]\d*$/;
            if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        // 包含 isRightNoLoseWholeNum 非负整数
        if (this_obj.hasClass('isRightNoLoseWholeNum')) {
            var regError = /^[0-9]\d*$/;
            if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }
        
        //包含 isNONULL
        if (this_obj.hasClass('isNONULL')) {
            if ($.trim(this_obj.val()) == '') {
                if ($("." + tmp_id).html() == undefined) {
                    $parent.append('<p class="errNo_tip ' + tmp_id + '"></p>');
                }
                this_obj.addClass('borError');
                return false;
            }
        }

        $("." + tmp_id).remove();
        return true;
    }).blur(function () {
        $(this).triggerHandler("keyup");
        let tmp_id, format_name, dhcpDataHeight, thisObjPositionTop, dhcpDataScrollTop;
        const this_obj = $(this);
        const $dhcpData = $('.dhcp-data');
        if (this_obj.closest('.dhcp_wrapper').length > 0 && $dhcpData && $dhcpData.length > 0) {
            dhcpDataHeight = $dhcpData.height();
            thisObjPositionTop = this_obj.position().top;
            dhcpDataScrollTop = $dhcpData.scrollTop();
        }
        
        if (this_obj.hasClass('doubleDeck')) {
            tmp_id = this_obj.parent().parent().parent().attr("id");
        } else if (this_obj.hasClass('threeLayers')) {
            tmp_id = this_obj.parent().parent().parent().parent().attr("id");
        } else if (this_obj.hasClass('twoLayers')) {
            tmp_id = this_obj.parent().parent().attr("id");
        } else {
            tmp_id = this_obj.attr("id");
        }

        if (this_obj.hasClass('LableData')) {
            format_name = this_obj.parent().find('label').html();
        } else {
            format_name = this_obj.parent().find('span').html();
        }

        if (this_obj.hasClass('borError')) {
            if (this_obj.hasClass('isDName')) {
                const input_val = $.trim(this_obj.val())
                const DNameRegError = /^[0-9A-Za-z\u4e00-\u9fa5~!@#%^&*()_+={}|:<> ?`[\]\\;/,.\-"'-：；–（）—‘’“”…～、？！，。【】｛｝｜《》￥·｀€£¥￥]*$/;
                const specialRegError = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/ig;
                if (this_obj.closest('.dhcp_wrapper').length > 0 && $dhcpData && $dhcpData.length > 0) {
                    if (thisObjPositionTop + dhcpDataScrollTop > dhcpDataHeight) {
                        $dhcpData.animate({
                            scrollTop: thisObjPositionTop + dhcpDataScrollTop + 20
                        }, 'slow');
                    }
                }
                if (this_obj.closest('.device_wrapper').length < 1) {
                    if ($.trim(this_obj.val()) == '') {
                        $("." + tmp_id).html(format_name + '不能为空');
                        return false;
                    }
                }
                if (!DNameRegError.test(input_val) || specialRegError.test(input_val)) {
                    $("." + tmp_id).html(format_name + '称由中英文、数字、空格和中英文特殊字符组成');
                    return false;
                }
            } else if (this_obj.hasClass('isPortTranspondName')) {
                var reg = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if ($.trim(this_obj.val()).match(/^[ ]*$/)) {
                    $("." + tmp_id).html(format_name + '非法');
                    return false;
                }
                if (!reg.test($.trim(this_obj.val()))) {
                    $("." + tmp_id).html(format_name + '只支持汉字、数字、字母和下划线，请修改重试');
                    return false;
                }
            } else if (this_obj.hasClass('isNaNSpeed')) {
                var re = /^$|^[]{0,1}(\d+)$/;
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '值不能为空');
                    return false;
                }
                if (!re.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 0) {
                    $("." + tmp_id).html(format_name + '值输入错误');
                    return false;
                }
            } else if (this_obj.hasClass('isMacAddr')) {
                var regError = /^(?!ff:ff:ff:ff:ff:ff$)(?!00:00:00:00:00:00$)(?:[A-Fa-f\d]{2}:){5}[A-Fa-f\d]{2}$/;
                if (this_obj.closest('.dhcp_wrapper').length > 0 && $dhcpData && $dhcpData.length > 0) {
                    if (thisObjPositionTop + dhcpDataScrollTop > dhcpDataHeight) {
                        $dhcpData.animate({
                            scrollTop: thisObjPositionTop + dhcpDataScrollTop + 20
                        }, 'slow');
                    }
                }
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!regError.test($.trim(this_obj.val()))) {
                    $("." + tmp_id).html(format_name + '格式出错');
                    return false;
                }
                if (this_obj.closest('.access_wrapper').length > 0 && this_obj.hasClass('noDevMac') && ($.trim(this_obj.val()).toLowerCase() == $.cookie("HostMac").toLowerCase())) {
                    $("." + tmp_id).html(format_name + '与设备MAC地址一致');
                    return false;
                }
            } else if (this_obj.hasClass('isIPAddr')) {
                const re = /^$|^[]{0,1}(\d+)$/;
                if (this_obj.closest('.dhcp_wrapper').length > 0 && $dhcpData && $dhcpData.length > 0) {
                    if (thisObjPositionTop + dhcpDataScrollTop > dhcpDataHeight) {
                        $dhcpData.animate({
                            scrollTop: thisObjPositionTop + dhcpDataScrollTop + 20
                        }, 'slow');
                    }
                }
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!re.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 1 || parseInt($.trim(this_obj.val())) > 254) {
                    $("." + tmp_id).html(format_name + '格式不正确');
                    return false;
                }
            } else if (this_obj.hasClass('isIPAddrExpand')) {
                const re = /^$|^[]{0,1}(\d+)$/;
                let start = "";
                let end = "";
                if (this_obj.attr("id") == "DMZIpAddr") {
                    start = this_obj;
                    end = this_obj.siblings('input');
                }
                if (this_obj.attr("id") == "DMZIpAddrTwo") {
                    start = this_obj.siblings('input');
                    end = this_obj;
                }
                const start_val = $.trim(start.val())
                const end_val = $.trim(end.val())

                if (this_obj.closest('.dhcp_wrapper').length > 0 && $dhcpData && $dhcpData.length > 0) {
                    if (thisObjPositionTop + dhcpDataScrollTop > dhcpDataHeight) {
                        $dhcpData.animate({
                            scrollTop: thisObjPositionTop + dhcpDataScrollTop + 20
                        }, 'slow');
                    }
                }
                if (start_val == '' || end_val == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false
                } 
                if (
                    !re.test(start_val) || 
                    !re.test(end_val) || 
                    parseInt(start_val) < 0 || 
                    parseInt(start_val) > 255 ||
                    parseInt(end_val) < 0 || 
                    parseInt(end_val) > 255 ||
                    (start_val == 0 && end_val == 0) ||
                    (start_val == 255 && end_val == 255)
                ) {
                    $("." + tmp_id).html(format_name + '格式不正确');
                }
            } else if (this_obj.hasClass('isPortNum')) {
                var re = /(^[1-9]\d*$)/;
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!re.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 0 || parseInt($.trim(this_obj.val())) > 65535) {
                    $("." + tmp_id).html(format_name + '错误，端口的合法范围[1,65535]');
                    return false;
                }
            } else if (this_obj.hasClass('isDomain')) {
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!isDomainFn($.trim(this_obj.val()))) {
                    $("." + tmp_id).html(format_name + '格式不正确');
                    return false;
                }
            } else if (this_obj.hasClass('isRightWholeNum')) {
                var re = /^[1-9]\d*$/;
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!re.test($.trim(this_obj.val()))) {
                    $("." + tmp_id).html('请输入正整数');
                    return false;
                }
            } else if (this_obj.hasClass('isRightNoLoseWholeNum')) {
                var re = /^[0-9]\d*$/;
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
                if (!re.test($.trim(this_obj.val()))) {
                    $("." + tmp_id).html('请输入非负整数');
                    return false;
                }
            } else if (this_obj.hasClass('isNONULL')) {
                if ($.trim(this_obj.val()) == '') {
                    $("." + tmp_id).html(format_name + '不能为空');
                    return false;
                }
            }
            return;
        }
    }).on('input', function () {
        const this_obj = $(this);
        let input_val = $.trim(this_obj.val());
        // 包含 isDName 或者 isPortTranspondName
        if (this_obj.hasClass('isDName') || this_obj.hasClass('isPortTranspondName')) {
            const maxLen = checkCharN(input_val);
            if (maxLen === 63) {
                this_obj.attr('maxlength', input_val.length)
            } else if(maxLen < 63) {
                this_obj.attr('maxlength', 63)
            }  else {
                this_obj.val(trimToMaxLength(input_val));
            }
        }
    });
}

function ClearVolide() {
    var requires = $("div").find('.requireIndependent');
    requires.each(function() {
        var errNoTip = $(this).siblings('.errNo_tip');
        if (errNoTip.length > 0) {
            errNoTip.remove();
        }
        if ($(this).hasClass('borError')){
            $(this).removeClass('borError');
        }
    });
}

$(document).ready(function () {
    DeviceVolide();
})