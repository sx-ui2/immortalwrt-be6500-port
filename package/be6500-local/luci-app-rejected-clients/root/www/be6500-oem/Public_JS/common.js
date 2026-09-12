/**提示信息 start */
$(document).ready(function () {
    volide();
})

/**提示信息 start */
function volide() {
    var requires = $("div").find('.require');
    var format_error_num = 0;
    requires.keyup(function () {
        var this_obj = $(this);
        var ByteCount;
        var $parent = this_obj.closest('.list');
        $parent.find(".icon_margin").remove();
        this_obj.removeClass('borError');
        var tmp_id = this_obj.attr("id");
        //isNULL
        if (this_obj.hasClass('isNULL') && this.value == '') {
            this_obj.removeClass('borError');
            $("." + tmp_id).remove();
            return;
        }

        //包含 isNONULL
        if (this_obj.hasClass('isNONULL')) {
            if ($.trim(this_obj.val()) == '') {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isRightWholeNum 正整数
        if (this_obj.hasClass('isRightWholeNum')) {
            var regError = /^[1-9]\d*$/;
            if (!regError.test($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined) 
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isPPPOE
        if (this_obj.hasClass('isPPPOE')) {
            var regError = new RegExp("[·~`》《。，,、><？、“”‘：；’】【']");
            if ($.trim(this_obj.val()) == '' || $.trim(this_obj.val()).match(/^[ ]*$/) || /[\u4e00-\u9fa5]/.test($.trim(this_obj.val())) || /[\uFF00-\uFFFF]/.test($.trim(this_obj.val())) || regError.test($.trim(this_obj.val()))) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isMtuNaN
        if (this_obj.hasClass('isMtuNaN')) {
            if ($.trim(this_obj.val()) != '') {
                const ipType = this_obj.attr("data-ip");
                const limitArr = ipType === 'ipv4' ? [576, 1492] : ipType === 'ipv6' ? [1280, 1492] : [0, 0];
                if (isNaN($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < limitArr[0] || parseInt($.trim(this_obj.val())) > limitArr[1]) {
                    if ($("." + tmp_id).html() == undefined)
                        $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                    this_obj.addClass('borError');
                    return false;
                }
            }
        }

        //包含 isALL
        if (this_obj.hasClass('isALL')) {
            ByteCount = checkChar($.trim(this.value));
            if (ByteCount > 32 || ByteCount < 1) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //包含 isCharNum
        if (this_obj.hasClass('isCharNum')) {
            ByteCount = checkChar($.trim(this.value));
            if (!charnum(this.value) || ByteCount == 0 || ByteCount > 32) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //isIP
        if (this_obj.hasClass('isIP') && (!isIpaddr(this.value) || this.value == '')) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return false;
        }

        //isDNS
        if (this_obj.hasClass('isDNS') && (!isDNS(this.value))) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return false;
        }

        //isEndIp
        if (this_obj.hasClass('isEndIp') && (!isIpaddr(this.value) || this.value == '' || (parseInt($(this).val().split(".")[3]) < parseInt($("#dhcp_start").val().split(".")[3])))) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return false;
        }

        //isNetmask
        if (this_obj.hasClass('isNetmask') && (!isNetmask(this.value) || this.value == '')) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return false;
        }

        //isNUM
        if (this_obj.hasClass('isNUM')) {
            // var startnum = parseInt(this_obj.attr('name').split("_@")[1].split("_")[0]) || '0';
            // var endnum = parseInt(this_obj.attr("name").split("_@")[1].split("_")[1]) || Number.MAX_VALUE;
            if (!isNum(this.value) || !isRangNum(this.value, 2, 2880)) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return false;
            }
        }

        //isEnglish
        if (this_obj.hasClass('isEnglish')) {
            ByteCount = checkChar($.trim(this.value));
            if (isChinese(this.value) || this.value.indexOf(" ") > -1 || ByteCount > 32 || ByteCount < 1) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }

        //isSSID
        if (this_obj.hasClass('isSSID')) {
            const ssidRegError = /^[0-9A-Za-z\u4e00-\u9fa5~!@#%^&*()_+={}|:<> ?`[\]\\;/,.\-"'-：；–（）—‘’“”…～、？！，。【】｛｝｜《》￥·｀€£¥￥]+$/;
            const specialRegError = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/ig;
            ByteCount = checkChar($.trim(this.value));
            if (ByteCount < 1 || !ssidRegError.test($.trim(this.value)) || specialRegError.test($.trim(this.value))) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right "><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }

        //isSSIDPwd
        if (this_obj.hasClass('isSSIDPwd')) {
            let val = this.value;
            ByteCount = checkChar(val);
            if (!format_check(val) || ByteCount < 8 || ByteCount > 63) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right "><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }

        //isHostName
        if (this_obj.hasClass('isHostName')) {
            const reg = /^(?![-_])[a-zA-Z0-9-_]+(?<![-_])$/;
            const val = $.trim(this.value);
            ByteCount = checkChar(val);
            if ((val !== "" && !reg.test(val)) || ByteCount > 63) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right "><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }

        // /isMAC
        if (this_obj.hasClass('isMAC') && (!isMac(this.value) || this.value == '')) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return;
        }

        //isUrl
        if (this_obj.hasClass('isUrl')) {
            ByteCount = checkChar($.trim(this.value));
            if (ByteCount > 63 || this.value == "" || this.value.indexOf(" ") > -1) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }

        //isSpeed
        if (this_obj.hasClass('isSpeed')) {
            var speed = $.trim(this.value);
            if (speed > 1024000 || speed < 0 || this.value == "" || this.value.indexOf(" ") > -1) {
                if ($("." + tmp_id).html() == undefined)
                    $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                this_obj.addClass('borError');
                return;
            }
        }
 
        //isIPv6Addr
        if (this_obj.hasClass('isIPv6Addr') && (!checkIPv6Addr(this.value) || this.value == '')) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return;
        }
        //isIPv6前缀
        if (this_obj.hasClass('isIPv6Prefix') && (!checkIPv6Prefix(this.value) || this.value == '')) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return;
        }
        //isIPv6Len
        if (this_obj.hasClass('isIPv6Len') && !(/^\d+$/.test(this.value) && this.value <= 128)) {
            if ($("." + tmp_id).html() == undefined)
                $parent.append('<div class="form_right"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
            this_obj.addClass('borError');
            return;
        }
        //包含 isIPFourBytes
        if (this_obj.hasClass('isIPFourBytes')) {
            var regError = /^$|^[]{0,1}(\d+)$/;
            if ($.trim(this_obj.val()) == '' || !regError.test($.trim(this_obj.val())) || parseInt($.trim(this_obj.val())) < 1 || parseInt($.trim(this_obj.val())) > 254) {
                if ($("." + tmp_id).html() == undefined) {
                    this_obj.parent().append('<div class="form_right" style="flex-shrink: 0;margin-left: 20px;"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                }
                this_obj.addClass('borError');
                return false;
            }
        } 
        //包含 isStartIPExpand
        if (this_obj.hasClass('isStartIPExpand')) {
            var regError = /^$|^[]{0,1}(\d+)$/;
            let start = "";
            let end = "";
            if(this_obj.attr("id") == "dhcp_start") {
                start = this_obj;
                end = this_obj.siblings('input');
            }
            if(this_obj.attr("id") == "dhcp_start_two") {
                start = this_obj.siblings('input');
                end = this_obj;
            }
            if (
                start.val() == '' || 
                end.val() == '' || 
                !regError.test(start.val()) || 
                !regError.test(end.val()) || 
                parseInt(start.val()) < 0 || 
                parseInt(start.val()) > 255 ||
                parseInt(end.val()) < 0 || 
                parseInt(end.val()) > 255 ||
                (start.val() == 0 && end.val() == 0) ||
                (start.val() == 255 && end.val() == 255)
            ) {
                if ($(".verify_start_error").html() == undefined) {
                    this_obj.parent().append('<div class="verify_start_error form_right" style="flex-shrink: 0;margin-left: 20px;"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                }
                this_obj.addClass('borError');
                return false;
            }
            $(".verify_start_error").remove();
        }

        //包含 isEndIPExpand
        if (this_obj.hasClass('isEndIPExpand')) {
            var regError = /^$|^[]{0,1}(\d+)$/;
            let start = "";
            let end = "";
            if(this_obj.attr("id") == "dhcp_end") {
                start = this_obj;
                end = this_obj.siblings('input');
            }
            if(this_obj.attr("id") == "dhcp_end_two") {
                start = this_obj.siblings('input');
                end = this_obj;
            }
            if (
                start.val() == '' || 
                end.val() == '' || 
                !regError.test(start.val()) || 
                !regError.test(end.val()) || 
                parseInt(start.val()) < 0 || 
                parseInt(start.val()) > 255 ||
                parseInt(end.val()) < 0 || 
                parseInt(end.val()) > 255 ||
                (start.val() == 0 && end.val() == 0) ||
                (start.val() == 255 && end.val() == 255)
            ) {
                if ($(".verify_end_error").html() == undefined) {
                    this_obj.parent().append('<div class="verify_end_error form_right" style="flex-shrink: 0;margin-left: 20px;"><div class="form_left error_tip ' + tmp_id + '"></div></div>');
                }
                this_obj.addClass('borError');
                return false;
            }
            $(".verify_end_error").remove();
        }

        $("." + tmp_id).remove();
        return true;
    }).blur(function () {
        $(this).triggerHandler("keyup");
        var this_obj = $(this);
        if (this_obj.hasClass('borError')) {
            show_format_error($(this), format_error_num, this_obj.attr("id"));
            format_error_num++;
            return;
        }
    }).on('input', function () {
        const this_obj = $(this);
        let input_val = $.trim(this_obj.val());
        let input_len = $.trim(this_obj.attr('data-maxlen'));
        // 包含 isSSID
        if (this_obj.hasClass('isSSID')) {
            const maxLen = checkChar(input_val);
            if (maxLen == input_len) {
                this_obj.attr('maxlength', input_val.length)
            } else if(maxLen < input_len) {
                this_obj.attr('maxlength', input_len)
            }  else {
                this_obj.val(trimToMaxLen(input_val, input_len));
            }
        }
    });
}

function show_format_error(obj, num, err_cla) {
    var regError = new RegExp("[·~`》《。，,、><？、“”‘：；’】【']");
    $("." + err_cla).removeClass('hide');
    var format_id = 'format_' + num;
    var format_name = obj.closest('.form_right').find('.tip_name').html();
    if (obj.hasClass('isSSID')) {
        const ssidRegError = /^[0-9A-Za-z\u4e00-\u9fa5~!@#%^&*()_+={}|:<> ?`[\]\\;/,.\-"'-：；–（）—‘’“”…～、？！，。【】｛｝｜《》￥·｀€£¥￥]+$/;
        const specialRegError = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/ig;

        if ($.trim(obj.val()) == '') {
            ErrorTip(format_id, '不能为空', format_name, err_cla);
            return false;
        }
        if (!ssidRegError.test($.trim(obj.val())) || specialRegError.test($.trim(obj.val()))) {
            ErrorTip(format_id, '由中英文、数字、空格和中英文特殊字符组成', format_name, err_cla);
            return false;
        }
    }
    else if (obj.hasClass('isPPPOE')) {
        if (obj.val() == '') {
            ErrorTip(format_id, '不能为空', format_name, err_cla);
            return false;
        }
        if (obj.val().match(/^[ ]*$/)) {
            ErrorTip(format_id, '非法', format_name, err_cla);
            return false;
        }
        if (/[\u4e00-\u9fa5]/.test(obj.val()) || /[\uFF00-\uFFFF]/.test(obj.val())) {
            ErrorTip(format_id, '不支持中文以及全角字符', format_name, err_cla);
            return false;
        }
        if (regError.test(obj.val())) {
            ErrorTip(format_id, '可能包含“<>,”等特殊符号，请修改重试', format_name, err_cla);
            return false;
        }
    }
    else if (obj.hasClass('isIPFourBytes')) {
        var re = /^$|^[]{0,1}(\d+)$/;
        if (obj.val() == '') {
            ErrorTip(format_id, '不能为空', format_name, err_cla);
            return false;
        }
        if (!re.test(obj.val()) || parseInt(obj.val()) < 1 || parseInt(obj.val()) > 254) {
            ErrorTip(format_id, '格式不正确', format_name, err_cla);
            return false;
        }
    }
    else if (obj.hasClass('isStartIPExpand')) {
        var re = /^$|^[]{0,1}(\d+)$/;
        if (obj.val() == '') {
            ErrorTip(format_id, '不能为空', format_name, err_cla);
        }  else {
            ErrorTip(format_id, '格式不正确', format_name, err_cla);
        }
    }
    else if (obj.hasClass('isEndIPExpand')) {
        var re = /^$|^[]{0,1}(\d+)$/;
        if (obj.val() == '') {
            ErrorTip(format_id, '不能为空', format_name, err_cla);
        }  else {
            ErrorTip(format_id, '格式不正确', format_name, err_cla);
        }
    }
    else if (obj.hasClass('isMtuNaN')) {
        const ipType = obj.attr("data-ip");
        const limitArr = ipType === 'ipv4' ? '[576~1492]' : ipType === 'ipv6' ? '[1280~1492]' : '';
        ErrorTip(format_id, `允许输入范围${limitArr}`, format_name, err_cla);
    }
    else if (obj.hasClass('isSSIDPwd')) {
        ErrorTip(format_id, '由长度8-63位的英文、数字、空格和英文特殊字符组成', format_name, err_cla);
    }
    else if (obj.hasClass('isHostName')) {
        ErrorTip(format_id, '由长度63位以内的英文、数字及-组成，且不能以 - 开始或结尾', format_name, err_cla);
    }
    else if (obj.hasClass('isEndIp')) {
        if ((!isIpaddr(obj.val()) || obj.val() == ''))
            ErrorTip(format_id, '格式出错', format_name, err_cla);
        else
            ErrorTip(format_id, 'DHCP结束地址不能小于开始地址', format_name, err_cla);
    }
    else if (obj.hasClass('isUpload')) {
        if (obj.val() == '') {
            ErrorTip(format_id, '上传速度不能为空', format_name, err_cla);
            return;
        }
        ErrorTip(format_id, '上传速度在0~1024000KB之间', format_name, err_cla);
    }
    else if (obj.hasClass('isDownload')) {
        if (obj.val() == '') {
            ErrorTip(format_id, '下载速度不能为空', format_name, err_cla);
            return;
        }
        ErrorTip(format_id, '下载速度在0~1024000KB之间', format_name, err_cla);
    }
     else if (obj.hasClass('isRightWholeNum')) {
        ErrorTip(format_id, '只能为正整数', format_name, err_cla);
    }
    else if (obj.val() == '' && obj.hasClass('isNONULL')) {
        ErrorTip(format_id, "不能为空", format_name, err_cla);
        return;
    }
    else if (obj.hasClass('isNUM')) {
        ErrorTip(format_id, '范围为2-2880分钟', format_name, err_cla);
    }
    else if (obj.hasClass('isIPv6Len')) {
        ErrorTip(format_id, '不符合规则', format_name, err_cla);
    }
    else {
        ErrorTip(format_id, '格式出错', format_name, err_cla);
    }
}

function ErrorTip(num, tiptext, setname, err_cla) {
    var error_id = 'error_' + num,
        this_html = '',
        setname = setname || '';
    this_html += tiptext;
    var temp_tips;
    temp_tips = $("." + err_cla).html();
    $("." + err_cla).text(setname + this_html);
    $("." + err_cla + "_1").hide();

}

function trimToMaxLen(input_val, input_len) {
    var new_val = input_val
    var max_len = checkChar(new_val);
    if (max_len > input_len) {
        new_val = new_val.slice(0, -1);
        return trimToMaxLen(new_val, input_len);
    }
    return new_val;
}

/** 检测IP*/
function Trim(str) {
    var result;
    //过滤两端空格
    result = str.replace(/(^\s+)|(\s+$)/g, "");
    //过滤所有空格
    result = result.replace(/\s/g, "");
    return result;
}

function format_check(str) {
    const pwdRegError = /^[0-9A-Za-z~!@#%^&*()_+={}|:<> ?`[\]\\;/,.\-"']*$/
    const specialRegError = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/ig;
    if (pwdRegError.test(str) && !specialRegError.test(str)) {
        return true;
    } else {
        return false;
    }
}

function special(str) {
    var pattern;
    pattern = /[\'\"\(\)\<\>\&\\\/\-]/im;
    if (pattern.test(str)) {
        return false;
    }
    return true;
}

function charnum(str) {
    var pattern;
    pattern = /^[A-Za-z0-9]+$/im;
    if (!pattern.test(str)) {
        return false;
    }
    return true;
}

function isNum(str) {
    var regExp = new RegExp("^\\d+$");
    return regExp.test(str)
}

function isRangNum(num, min, max) { //
    if (isNum(num)) {
        if (num >= min && num <= max) return true;
    }
    return false;
}

//Ip地址检测/网关
function isIpaddr(ip) {
    var regExp = new RegExp(/^(?:(?:25[0-5]|2[0-4]\d|((1\d{2})|([1-9]?\d)))\.){3}(?:25[0-5]|2[0-4]\d|((1\d{2})|([0-9]?\d)|([1-9])))$/);
    if (regExp.test(ip)) {
        ip_array = ip.split('.');
    }
    if (!regExp.test(ip) || IpToNumber(ip) < 16777216 || IpToNumber(ip) == 4294967295) {
        return false;
    } else {
        return true;
    }
}

function isDNS(ip) {
    if (ip == "0.0.0.0")
        return true;
    else {
        var regExp = new RegExp(/^(?:(?:25[0-5]|2[0-4]\d|((1\d{2})|([1-9]?\d)))\.){3}(?:25[0-5]|2[0-4]\d|((1\d{2})|([0-9]?\d)|([1-9])))$/);
        if (regExp.test(ip)) {
            ip_array = ip.split('.');
        }
        if (!regExp.test(ip) || IpToNumber(ip) < 16777216 || IpToNumber(ip) == 4294967295) {
            return false;
        } else {
            return true;
        }
    }
}

function isNetmask(mask) { //子网掩码
    var correct_range = {
        128: 1,
        192: 1,
        224: 1,
        240: 1,
        248: 1,
        252: 1,
        254: 1,
        255: 1,
        0: 1
    };
    var m = mask.split('.');
    if (m.length != 4)
        return false;

    for (var i = 0; i < 4; i++) {
        if (!(m[i] in correct_range) ||
            (i < 3 && m[i] > 0 && m[i] < 255 && m[i + 1] != 0)) {
            return false;
        }
    }

    return true;
}

function isTime(str) {
    var regExp = new RegExp("^(([1-9]{1})|([0-1][0-9])|([1-2][0-3])):([0-5][0-9])$");
    if (regExp.test(str)) {
        return true;
    }
    return false;
}

function isDomain(str) {
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

function isDomainName(domain) {
    if (domain.length >= 33)
        return false;
    var regExp = new RegExp(/^[0-9a-zA-Z]*$/);
    if (regExp.test(domain)) {
        return true;
    }
    return false;
}

function isDomainPort(domain) {
    if (domain.length >= 68)
        return false;
    var regExp = new RegExp("^[0-9a-zA-Z]+([\.0-9a-zA-Z\-])*\.([a-zA-z])+:([0-9]+)$");
    if (regExp.test(domain))
        return true;
    return false;
}

function isUrl(str) {
    var reg = /[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&amp;:/~\+#]*[\w\-\@?^=%&amp;/~\+#])?/;
    return (reg.test(str));
}

function checkIPv6Prefix(str) {
    var reg = /^((\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*)(\/(([1-9])|([1-9][0-9])|(1[0-1][0-9]|12[0-8]))){0,1})*$/
    if(reg.test(str)) {
        if(str.slice(-2) === '::') {
            return true
        } else {
            return false
        }
    } else {
        return false
    }
}

function checkIPv6Addr(str) {
    var reg = /^\s*((([0-9A-Fa-f]{1,4}:){7}(([0-9A-Fa-f]{1,4})|:))|(([0-9A-Fa-f]{1,4}:){6}(:|((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})|(:[0-9A-Fa-f]{1,4})))|(([0-9A-Fa-f]{1,4}:){5}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(([0-9A-Fa-f]{1,4}:){4}(:[0-9A-Fa-f]{1,4}){0,1}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(([0-9A-Fa-f]{1,4}:){3}(:[0-9A-Fa-f]{1,4}){0,2}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(([0-9A-Fa-f]{1,4}:){2}(:[0-9A-Fa-f]{1,4}){0,3}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(([0-9A-Fa-f]{1,4}:)(:[0-9A-Fa-f]{1,4}){0,4}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(:(:[0-9A-Fa-f]{1,4}){0,5}((:((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})?)|((:[0-9A-Fa-f]{1,4}){1,2})))|(((25[0-5]|2[0-4]\d|[01]?\d{1,2})(\.(25[0-5]|2[0-4]\d|[01]?\d{1,2})){3})))(%.+)?\s*$/;
    if (str.indexOf('/') != -1) {
        var strSuffix = str.slice((str.indexOf('/') + 1));
        if (strSuffix == '' || parseInt(strSuffix) > 128) {
            return false;
        } else {
            var sliceStr = str.slice(0, str.indexOf('/'));
            return (reg.test(sliceStr));
        }
    } else {
        return (reg.test(str));
    }
}

function isMac(str) {
    var reg1 = /^(?!ff:ff:ff:ff:ff:ff$)(?!00:00:00:00:00:00$)(?:[A-Fa-f\d]{2}:){5}[A-Fa-f\d]{2}$/;
    return (reg1.test(str));
}

function isServer(str) {
    var s1 = str.split(':');
    if (s1.length > 2) {
        return false;
    }
    if (s1.length == 2 && !valide.isRangNum(s1[1], 1, 65535)) {
        return false;
    }
    if (!valide.isIpaddr(s1[0]) && !valide.isDomain(s1[0])) {
        return false;
    }
    return true;
}

function isSameNet(ip, mask, ip2, mask2) {
    if (!valide.isIpaddr(ip) || !valide.isNetmask(mask) || !valide.isIpaddr(ip) || !valide.isNetmask(mask2))
        return false;
    if (ip == "0.0.0.0" || ip2 == "0.0.0.0")
        return false;

    sip = [ip.split('.'), ip2.split('.')];
    smask = [mask.split('.'), mask2.split('.')];
    var i;
    for (i = 0; i < 4; i++) {
        if ((Number(sip[0][i]) & Number(smask[0][i])) != (Number(sip[1][i]) & Number(smask[1][i])))
            break;
    }
    if (i == 4)
        return true;
    return false;
}

function isChinese(mask) { //用户名密码
    var regExp = new RegExp(/[\u4e00-\u9fa5|\u0020]+/);
    return regExp.test(mask);
}

function checkChar(Message) { //字节统计
    var ByteCount = 0;
    var StrLength = Message.length;
    for (var i = 0; i < StrLength; i++) {
        ByteCount = (Message.charCodeAt(i) < 128) ? ByteCount + 1 : ByteCount + 3;
    }
    return ByteCount;
}

function IpToNumber(ip) {
    var num = 0;
    if (ip == "") {
        return num;
    }
    var aNum = ip.split(".");
    if (aNum.length != 4) {
        return num;
    }
    num += parseInt(aNum[0]) << 24;
    num += parseInt(aNum[1]) << 16;
    num += parseInt(aNum[2]) << 8;
    num += parseInt(aNum[3]) << 0;
    num = num >>> 0;
    return num;
}

/**提示信息 end */

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

function format_volide_ok(obj) {
    if (!obj || obj == undefined) {
        obj = 'body'
    }
    var requires = $(obj).find('.require');
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
};

/**进度条 */
function loading_center(obj) {
    var screenWidth = $(window.parent).width(),
        screenHeight = $(window.parent).height(); //当前浏览器窗口的 宽高
    var scrolltop = $(window.parent).scrollTop(); //获取当前窗口距离页面顶部高度
    var objLeft = (screenWidth) / 2;
    var objTop = (screenHeight) / 2 - 300 + scrolltop;
    obj.css({
        // left: objLeft + 'px',
        top: objTop + 'px',
        'display': 'block'
    });
    //浏览器窗口大小改变时
    $(window.parent).resize(function () {
        screenWidth = $(window.parent).width();
        screenHeight = $(window.parent).height();
        scrolltop = $(window.parent).scrollTop();
        objLeft = (screenWidth - obj.width()) / 2;
        objTop = (screenHeight) / 2 - 300 + scrolltop;
        obj.css({
            // left: objLeft + 'px',
            top: objTop + 'px',
            'display': 'block'
        });
    });
    //浏览器有滚动条时的操作、
    $(window.parent).scroll(function () {
        screenWidth = $(window.parent).width();
        screenHeight = $(window.parent).height();
        scrolltop = $(window.parent).scrollTop();
        objLeft = (screenWidth - obj.width()) / 2;
        objTop = (screenHeight) / 2 - 300 + scrolltop;
        obj.css({
            //left: objLeft + 'px',
            top: objTop + 'px',
            'display': 'block'
        });
    });
}

function center_new(obj) {
    var screenHeight = $(window.parent).height(); //当前浏览器窗口的 宽高
    var scrolltop = $(window.parent).scrollTop(); //获取当前窗口距离页面顶部高度
    var objTop = (screenHeight - obj.height()) / 2 + scrolltop - 296;
    if (objTop < 0) {
        objTop = 0
    }
    obj.css({
        left: 600 + 'px',
        top: objTop + 'px',
        'display': 'block'
    });
    //浏览器窗口大小改变时
    $(window.parent).resize(function () {
        screenHeight = $(window.parent).height();
        scrolltop = $(window.parent).scrollTop();
        objTop = (screenHeight - obj.height()) / 2 + scrolltop - 296;
        if (objTop < 0) {
            objTop = 0
        }
        obj.css({
            left: 600 + 'px',
            top: objTop + 'px'
        });
    });
    //浏览器有滚动条时的操作、
    $(window.parent).scroll(function () {
        screenHeight = $(window.parent).height();
        scrolltop = $(window.parent).scrollTop();
        objTop = (screenHeight - obj.height()) / 2 + scrolltop - 296;
        if (objTop < 0) {
            objTop = 0
        }
        obj.css({
            left: 600 + 'px',
            top: objTop + 'px'
        });
    });
}

function setting(times, callback) {
    var topmask = window.top.document.getElementById('mask');
    topmask.style.display = "block";
    times = times || 1;
    var $setbox = (!$('.loading').length) ? $('<div>').addClass('loading') : $('.loading');
    var $backdrop = $('<div>').addClass('loading-backdrop');
    var $loadcont = $('<div>').addClass('loadcont');
    var $progress = '<div class="skillbar css"><div class="filled" data-width="100%"></div><span class="percent"></span></div>';
    var $progressbox = $('<div>').addClass('progressbox').append($progress);
    $setbox.append($backdrop, $loadcont.append($progressbox)).appendTo('body');
    loading_center($('.loading'));
    $(".skillbar").skillbar({
        speed: times * 1000,
        onComplete: function() {
            callback()
        }
    });
};

function setupSelfDnsInput(selector) {
    const $dnsInput = $(selector)
    const $dnsClose = $dnsInput.siblings('.dns_close')
    const $dnsSelect = $dnsInput.parent().siblings('.dns_select')

    // 点击dns输入框，展示下拉框
    $dnsInput.on('click', (event) => {
      event.stopPropagation()
      $dnsSelect.slideDown()
    })

    // dns输入框 输入值，收起下拉框，并且展示清除图标
    $dnsInput.on('input', (e) => {
      if (e.target.value) {
        $dnsClose.show()
        $dnsSelect.slideUp()
      } else {
        $dnsClose.hide()
        $dnsSelect.slideDown()
      }
    })

    // 点击清除图标，清空输入框的值
    $dnsClose.on('click', (event) => {
      event.stopPropagation()
      $dnsInput.val('').trigger('blur')
      $dnsClose.hide()
    })

    // 点击列表，渲染到input
    $dnsSelect.on('click', '.dns_select_item', function() {
      const value = $(this).find('.dns_select_item_ip').text()
      $dnsInput.val(value).trigger('blur')
    })

    // 鼠标移入dns输入框或清除图标，展示清除图标
    $dnsInput.add($dnsClose).on('mouseenter', () => {
      if ($dnsInput.val()) {
        $dnsClose.show()
      }
    })

    // 鼠标移出dns输入框，隐藏清除图标
    $dnsInput.on('mouseleave', () => {
      $dnsClose.hide()
    })
}

"use strict";
/*
 * Plugin: an-progress-bar
 * Version: 1.0.1
 * Description: A plugin that fills bars with a percentage you set.
 * Author: Hasan Misbah
 * Copyright 2018, Hasan Misbah
 * Free to use and abuse under the MIT license.
 * http://www.opensource.org/licenses/mit-license.php
 */
!function (i) {
    i.fn.skillbar = function (t) {
        var e = i.extend({
            speed: 1000,
            bg: "",
            onComplete: null // 添加一个回调函数的参数
        }, t),
        n = e.bg,
        d = i(this).find(".filled"),
        s = i(this).find(".title");

        return n ? (d.css({
            "background-color": n
        }), s.css({
            "background-color": "rgba(0,0,0,0.5)"
        })) : this.each(function () {
            i(this).find(".filled").animate({
                width: i(this).find(".filled").data("width")
            }, e.speed, function() {
                // 动画完成后调用回调函数
                if (typeof e.onComplete === 'function') {
                    e.onComplete();
                }
            });
        }), this;
    }
}(jQuery);
//# sourceMappingURL=an-skill-bar.js.map

(function ($) {
    var a = function (i) {
        return new a.fn.init(i)
    };
    var c = "",
        g = 0,
        f = 10000,
        e = {},
        b;
    a.fn = a.prototype = {
        init: function (n) {
            var j = this,
                i = "",
                m = "",
                l = global_sure;
            if (typeof (n) == "string") {
                if ($.trim(n) != "") {
                    c = n
                } else {
                    c = i
                }
                j.title = m;
                j.obTxt = l[0];
                j.cbTxt = l[1];
                j.moreBox = false;
                j.drop = false;
                j.okFn = function () {
                    return true
                };
                j.cancelFn = function () {
                    return true
                };
                j.closeFn = function () {
                    return true
                };
                j.goTopage(j._html(""))
            } else {
                if (n) {
                    if (!j.isObject(n)) {
                        return
                    }
                    var o = $.trim(j.getHtml(n.message));
                    c = o != "" ? o : i;
                    j.title = ($.trim(n.title) != "" && n.title != undefined) ? n.title : m;
                    j.obTxt = ($.trim(n.obTxt) != "" && n.obTxt != undefined) ? n.obTxt : l[0];
                    j.cbTxt = ($.trim(n.cbTxt) != "" && n.cbTxt != undefined) ? n.cbTxt : l[1];
                    j.vBtn = ($.trim(n.vBtn) != "" && n.vBtn != undefined) ? n.vBtn : "all";
                    j.moreBox = n.moreBox != undefined ? n.moreBox : true;
                    j.drop = true;
                    j.okFn = n.okFn && j.isFunction(n.okFn) ? n.okFn : function () {
                        return true
                    };
                    j.cancelFn = n.cancelFn && j.isFunction(n.cancelFn) ? n.cancelFn : function () {
                        return true
                    };
                    j.closeFn = n.closeFn && j.isFunction(n.closeFn) ? n.closeFn : function () {
                        return true
                    };
                    j.goTopage(j._html(n.message))
                }
            }
            return j
        },
        goTopage: function (m) {
            if (g >= 2) return;
            g++;
            var n = $('<div class="pop_confirm">'),
                l = "pop" + Math.random().toString().replace(/\w\./, "_").substr(0, 5),
                k = n.clone();
            n.attr("id", l);
            n.css({
                position: "absolute",
                "z-index": f * g
            });
            n.html(m);
            k.addClass("c_mask");
            if (!this.moreBox) {
                $(".pop_confirm").remove();
                g = 1
            }
            $("body").append(n);
            var i = $(".pop_confirm").length;
            if (i == 1) {
                $("body").append(k)
            }
            this.lockScreen();
            b = this.boxPosition("#" + l);
            var j = $("#" + l);
            this.moveOn(j, "r-btn");
            j.attr("r-sVal", j.width() + "|" + j.height())
        },
        getHtml: function (k) {
            var j = "",
                i;
            if (typeof (k) == "string" && $.trim(k) != "") {
                i = $(k);
                j = i.clone().html();
                e[k] = j;
                i.html("")
            }
            return j
        },
        setHtml: function (j) {
            if ($.trim(j) == "") {
                return
            }
            for (var k in e) {
                if (j == k) {
                    $(j).html(e[k])
                }
            }
        },
        _html: function (j) {
            if (typeof (j) != "string") {
                return
            }
            var i = '<table border="0" cellspacing="0" cellpadding="0" align="left" class="c_cont">';
            i += '<tr r-drag="yes"><td valign="top"><div class="c_title" ><span>' + this.title + '</span></div><a href="javascript:void(0);" class="fa close" title="close" r-btn="close"></a><a href="javascript:void(0);" class="open" title="open" r-btn="open"></a></td></tr>';
            i += '<tr><td  valign="top"><div class="c_default-conts" ' + ($.trim(j) != "" ? 'r-group="' + j + '"' : "") + ">" + c + "</div></td></tr>";
            if (this.vBtn != "none") {
                i += '<tr r-footer><td valign="middle" class="c_btn">';
                if (this.vBtn == "ok") {
                    i += '<a tabindex="6" class="btn btn-warning" href="javascript:void(0)"  r-btn="ok"><span>' + this.obTxt + "</span></a>"
                } else {
                    if (this.vBtn == "no") {
                        i += '<a tabindex="6" class="btn btn-default" href="javascript:void(0)"  r-btn="cancel"><span>' + this.cbTxt + "</span></a>"
                    } else {
                        i += '<a tabindex="6" class="btn btn-default" href="javascript:void(0)" r-btn="cancel"><span>' + this.cbTxt + '</span></a><a tabindex="6" class="btn btn-primary c_ml15" href="javascript:void(0)" r-btn="ok"><span>' + this.obTxt + "</span></a>"
                    }
                }
                i += "</td></tr>"
            }
            i += "</table>";
            return i
        },
        moveOn: function (j, k) {
            var i = this;
            j.on("click tap", "[" + k + "]",
                function () {
                    var m = $(this),
                        n = m.attr(k);
                    var q = m.closest(".pop_confirm"),
                        l = q.find("[r-group]").attr("r-group");
                    switch (n) {
                        case "ok":
                            var p = i.okFn();
                            if (p) {
                                if (l) {
                                    i.setHtml(l)
                                }
                                q.remove();
                                g--;
                                i.lockScreen()
                            }
                            break;
                        case "cancel":
                            var t = i.cancelFn();
                            if (t) {
                                if (l) {
                                    i.setHtml(l)
                                }
                                q.remove();
                                g--;
                                i.lockScreen()
                            }
                            break;
                        case "close":
                            var s = i.closeFn();
                            if (s) {
                                if (l) {
                                    i.setHtml(l)
                                }
                                q.remove();
                                g--;
                                i.lockScreen()
                            }
                            break;
                        case "open":
                            var r = j.attr("r-state");
                            if (r == "yes") {
                                var o = j.attr("r-sVal").split("|");
                                i.zoomWindow(j, {
                                    w: o[0],
                                    h: o[1]
                                });
                                j.attr("r-state", "no")
                            } else {
                                i.zoomWindow(j);
                                j.attr("r-state", "yes")
                            }
                            break;
                        case "lock":
                            a.blank("c_cont", 3);
                            break
                    }
                    if (g == 0) {
                        $(".c_mask").remove()
                    }
                })
        },
        lockScreen: function () {
            var j = $("<p>");
            j.css({
                position: "absolute",
                top: "0px",
                left: "0px",
                "z-index": (f * g) + 1
            });
            j.attr("r-btn", "lock");
            j.addClass("lock");
            var i = $("[r-group]");
            i.each(function (m) {
                var n = $(this),
                    l = n.find(".lock");
                if (m != (g - 1)) {
                    if (l.length == 0) {
                        var k = n.closest(".c_cont");
                        j.css({
                            width: k.width(),
                            height: k.height()
                        });
                        n.append(j)
                    }
                } else {
                    l.remove()
                }
            })
        },
        boxPosition: function (k) {
            if (typeof (k) != "string") {
                return
            }
            var j = this;
            var i = {
                init: function (n) {
                    var m = $(n);
                    w = m.width(),
                        h = m.height();
                    var l = this.center(w, h);
                    if (w < 900) {
                        m.css({
                            top: 40,
                            left: l.left
                        });
                    } else {
                        m.css({
                            top: l.top,
                            left: l.left
                        });
                    }
                    this.drag(j.drop, n);
                    return this
                },
                center: function (l, n) {
                    var q = $(window),
                        m = q.width(),
                        p = q.height();
                    var o = q.scrollTop(),
                        r = q.scrollLeft();
                    return {
                        top: (p - n) / 2 + o,
                        left: (m - l) / 2 + r
                    }
                },
                move: function (o, p, r, l, m, n) {
                    var q = {};
                    o.bind("mousemove",
                        function (A) {
                            var z = $(this);
                            q.x = A.clientX;
                            q.y = A.clientY;
                            var C = z.scrollLeft(),
                                B = z.scrollTop();
                            var x = r + (q.y - m),
                                v = l + (q.x - n);
                            var y = p.width(),
                                t = p.height();
                            var u = z.width(),
                                s = z.height();
                            if (v <= 0) {
                                v = 0
                            } else {
                                if ((v + y) >= u) {
                                    v = u - y
                                }
                            }
                            if (x <= 0) {
                                x = 0
                            } else {
                                if ((x + t) >= s) {
                                    x = s - t
                                }
                            }
                            p.css({
                                top: x + "px",
                                left: v + "px"
                            });
                            j.stopDefault(A)
                        })
                },
                drag: function (n, l, r) {
                    if (!j.isBoolean(n)) {
                        return
                    } else {
                        if (!n) {
                            return
                        }
                    }
                    var p = this,
                        q = r || $(document);
                    var s = j.isObject(q) ? q : $(q);
                    var o = $(l),
                        m = o.find("[r-drag]");
                    var t = ["mousedown", "mouseup"];
                    m.bind(t[0],
                        function (A) {
                            m.css("cursor", "move");
                            var z = o.offset().top,
                                v = o.offset().left,
                                u = A.clientX,
                                B = A.clientY;
                            p.move(s, o, z, v, B, u);
                            j.stopDefault(A)
                        });
                    s.bind(t[1],
                        function () {
                            m.css("cursor", "");
                            s.unbind("mousemove")
                        })
                }
            };
            return i.init(k)
        },
        zoomWindow: function (j, n) {
            var o = $(j),
                t = o.find(".c_default-conts");
            var s = 0,
                p = 0,
                l = 8,
                k = 30,
                m = o.find("[r-footer]").height();
            if (n) {
                s = n.w - l;
                p = n.h - (k + l + m);
                var i = b.center(n.w, n.h);
                o.css({
                    top: i.top,
                    left: i.left
                })
            } else {
                var q = $(window),
                    r = q.scrollTop();
                o.css({
                    top: r + "px",
                    left: "0px"
                });
                s = q.width() - l;
                p = q.height() - (k + l + m)
            }
            t.css({
                width: s + "px",
                height: p + "px"
            });
            t.children().css({
                width: "100%",
                height: "100%"
            })
        },
        error: function (j, i) { },
        stopDefault: function (i) {
            if (i && i.preventDefault) {
                i.preventDefault()
            } else {
                window.event.returnValue = false
            }
            return false
        },
        isBoolean: function (i) {
            return Object.prototype.toString.call(i) === "[object Boolean]"
        },
        isFunction: function (i) {
            return Object.prototype.toString.call(i) === "[object Function]"
        },
        isObject: function (i) {
            return Object.prototype.toString.call(i) === "[object Object]"
        }
    };
    a.normal = function (k, j) {
        var i = $("." + k).last();
        i.css("border-color", "");
        if (j < 0) {
            return
        }
        j = j - 1;
        setTimeout("confirmBox.blank('" + k + "'," + j + ")", 60)
    };
    a.blank = function (k, j) {
        var i = $("." + k).last();
        i.css("border-color", "#ffffcc");
        j = j - 1;
        setTimeout("confirmBox.normal('" + k + "'," + j + ")", 120)
    };
    a.fn.init.prototype = a.fn;
    $.confirmBox = a
})(jQuery);

//页面刷新
function gohref(params) {
    var refresh = typeof params == 'undefined' ? 1 : 0;
    var topmask = window.top.document.getElementById('mask');
    topmask.style.display = "none";
    $(".loading-backdrop").remove();
    $(".skillbar").remove();
    if (refresh) {
        window.location.reload();
    }
    // window.location.reload();
}

function Disable_refresh() {
    $("body").bind("keydown", function (e) {
        e = window.event || e;
        //禁止空格键翻页   
        if (event.keyCode == 32) {
            return false;
        }
        //屏蔽F5刷新键   
        if (event.keyCode == 116) {
            e.keyCode = 0; //IE下需要设置为keyCode为false   
            return false;
        }
        //屏蔽 Alt+ 方向键 ←   
        //屏蔽 Alt+ 方向键 →  
        if ((event.altKey) && ((event.keyCode == 37) || (event.keyCode == 39))) {
            event.returnValue = false;
            return false;
        }
        //屏蔽退格删除键   
        if (event.keyCode == 8) {
            return false;
        }
        //屏蔽ctrl+R   
        if ((event.ctrlKey) && (event.keyCode == 82)) {
            e.keyCode = 0;
            return false;
        }
    });
}

function gohref_ip() {
    var htmlHref = window.location.href;
    htmlHref = htmlHref.replace(/^http:\/\//, "");
    var index = htmlHref.indexOf('/');
    htmlHref = htmlHref.substring(0, index);
    return htmlHref;
}


