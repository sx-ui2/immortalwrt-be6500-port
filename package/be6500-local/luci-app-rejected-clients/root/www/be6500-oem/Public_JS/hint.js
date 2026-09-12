function center_1(obj) {
    var screenWidth = $(window).width(),
        screenHeight = $(window).height(); //当前浏览器窗口的 宽高
    var scrolltop = $(document).scrollTop(); //获取当前窗口距离页面顶部高度
    var objLeft = (screenWidth - obj.width()) / 2;
    var objTop = (screenHeight - obj.height()) / 2 + scrolltop;
    obj.css({
        left: objLeft + 'px',
        top: objTop + 'px',
        'display': 'block'
    });
    //浏览器窗口大小改变时
    $(window).resize(function () {
        screenWidth = $(window).width();
        screenHeight = $(window).height();
        scrolltop = $(document).scrollTop();
        objLeft = (screenWidth - obj.width()) / 2;
        objTop = (screenHeight - obj.height()) / 2 + scrolltop;
        obj.css({
            left: objLeft + 'px',
            top: objTop + 'px',
            'display': 'block'
        });
    });
    //浏览器有滚动条时的操作、
    $(window).scroll(function () {
        screenWidth = $(window).width();
        screenHeight = $(window).height();
        scrolltop = $(document).scrollTop();
        objLeft = (screenWidth - obj.width()) / 2;
        objTop = (screenHeight - obj.height()) / 2 + scrolltop;
        obj.css({
            left: objLeft + 'px',
            top: objTop + 'px',
            'display': 'block'
        });
    });
}
function hintShaed(hintContent, hintClass, isHtml = false) {
    $(window).keydown(function (e) {
        var key = window.event ? e.keyCode : e.which;
        if (key.toString() == "13") {
            return false;
        }
    });
    if (!$('.HintDialogBox').length) {
        var html = '';
        html += '<div class="HintDialog"><div>';
        html += '<table class="Hinttable"><tbody>';
        html += '<tr><td class="hintDialogIcon"><span class="iconfont hinticonfont"></span></td>';
        html += '<td class="hintDialogContent"><span class="hintDialogText"></span></td></tr>';
        html += '</tbody></table></div></div>';
        html += '<div class="blackMask"></div>';

        $('body').append(html);
    }

    $('.blackMask').on('click', function () {
        if(isHtml) return;
        $(this).remove();
        $('.HintDialog').remove();
    })

    $('.hinticonfont').attr('class', 'iconfont hinticonfont ' + hintClass);
    if(isHtml) {
        $('.hintDialogContent').html(hintContent);
    } else {
        $('.hintDialogText').text(hintContent);
    }
    $('.blackMask').show();
    center_1($('.HintDialog'));

    setTimeout(function() { 
        $('.blackMask').remove();
        $('.HintDialog').remove();
    },2000);
}

function hintProgressBar(time = 15, callback) {
    $(window).keydown(function (e) {
        var key = window.event ? e.keyCode : e.which;
        if (key.toString() == "13") {
            return false;
        }
    });

    if (!$('.HintDialogBox').length) {
        var html = '';
        html += '<div class="HintDialog"><div>';
        html += '<table class="Hinttable"><tbody>';
        html += '<tr><td class="hintDialogIcon" style="padding-top: 16px;padding-bottom: 16px;"><span class="hintRadius"></span></td>';
        html += '<td style="padding-left: 16px;"><span class="hintDialogText"></span></td></tr>';
        html += '</tbody></table></div></div>';
        html += '<div class="blackMask"></div>';

        $('body').append(html);
    }
    
    $('.hintDialogText').text('加载中...');
    $('.blackMask').show();
    center_1($('.HintDialog'));

    setTimeout(function() { 
        $('.blackMask').remove();
        $('.HintDialog').remove();
        hintShaed("配置成功", 'icon-duigouxuanzhong');
        callback && callback();
    }, time * 1000);
}

function startLoading() {
    var html = '';
    html += '<div class="HintDialog"><div>';
    html += '<table class="Hinttable"><tbody>';
    html += '<tr><td class="hintDialogIcon" style="padding-top: 16px;padding-bottom: 16px;"><span class="hintRadius"></span></td>';
    html += '<td style="padding-left: 16px;"><span class="hintDialogText"></span></td></tr>';
    html += '</tbody></table></div></div>';
    html += '<div class="blackMask"></div>';
    $('body').append(html);

    $('.hintDialogText').text('加载中...');
    $('.blackMask').show();
    center_1($('.HintDialog'));
}

function stopLoading() {
    $('.blackMask').remove();
    $('.HintDialog').remove();
}

function formatTime(timestamp) {
    let timeStr = String(timestamp);
    let date = new Date(timeStr.length == 10 ? timestamp * 1000 : timestamp);
    let year = date.getFullYear();
    let month = date.getMonth() + 1 >= 10 ? date.getMonth() + 1 : '0' + (date.getMonth() + 1);
    let day = date.getDate() >= 10 ? date.getDate() : '0' + date.getDate();
    let hours = date.getHours() >= 10 ? date.getHours() : '0' + date.getHours();
    let minute = date.getMinutes() >= 10 ? date.getMinutes() : '0' + date.getMinutes();
    return `${year}/${month}/${day} ${hours}:${minute}`;
}

/**
 * 数组去重
 * arr: 需要去重的数组
 * keyVal: 需要对应的key
 * isNeedRepeat: 是否需要重复的项
*/
function dealArray(arr, keyVal = 'key', isNeedRepeat = false) {
    let newArr = [];
    let repeatArr =[];
    arr.forEach(item1 => {
        let flag = false;
        newArr.forEach(item2 => {
            if(item2[keyVal] == item1[keyVal]) {
                flag = true;
                let filterArr = repeatArr.filter(val => val[keyVal] === item2[keyVal]);
                if(!filterArr.length) {
                    repeatArr.push(item2);
                }
            }
        })
        if(flag == false) {
            newArr.push(item1);    
        }
    })
    if(isNeedRepeat) {
        return repeatArr
    } else {
        return newArr
    }
}