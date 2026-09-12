//保存成功弹窗
//在执行结果函数中直接调用即可saveSuccessed()，切记先引入public.js文件
//可参考vlan.js中createVlan函数调用
function saveSuccessed(info) {
    if (!$('#saveSuccessed').length) {
        var html = '';
        html += '<div id="saveSuccessed" class="modal fade">';
        html += '<div class="modal-dialog">';
        html += '<div class="modal-content">';
        html += '<div class="modal-body">';
        html += '<div class="confirmation">';
        html += '<span class="iconfont icon-duigouxuanzhong"></span><span>&nbsp;&nbsp;&nbsp;&nbsp;' + info + '</span>';
        html += '</div></div></div></div></div>';
        $('body').append(html);
    }

    $('#saveSuccessed').modal('show');
}

//保存失败弹窗
//在执行结果函数中直接调用即可saveFailed()，切记先引入public.js文件
function saveFailed(info) {
    if (!$('#saveFailed').length) {
        var html = '';
        html += '<div id="saveFailed" class="modal fade">';
        html += '<div class="modal-dialog">';
        html += '<div class="modal-content">';
        html += '<div class="modal-body">';
        html += '<div class="confirmation">';
        html += '<span id="failedIcon" class="iconfont icon-gantanhao-yuankuang"></span><span>&nbsp;&nbsp;&nbsp;&nbsp;' + info + '</span>';
        html += '</div></div></div></div></div>';
        $('body').append(html);
    }

    $('#saveFailed').modal('show');
}

//警告弹窗
//设置失败时调用，调用时将失败提示信息作为参数传入即可，切记先引入public.js文件.
//可参考vlan.js中errInfo()函数调用
function warning(Info) {
    if (!$('#warning').length) {
        var html = '';
        html += '<div id="warning" class="modal fade">';
        html += '<div class="modal-dialog">';
        html += '<div class="modal-content">';
        html += '<div class="modal-body">';
        html += '<div class="confirmation">';
        html += '<div class="row">';
        html += '<table class="table" style="margin-bottom:0;">';
        html += '<tr><td><span class="iconfont icon-gantanhao-yuankuang"></span></td><td>';
        html += '<span id="warningInfo"></span></td></tr></table>';
        html += '</div></div></div></div></div></div>';
        $('body').append(html);
    }


    if (Info.length <= 8) {
        $('.icon-gantanhao-yuankuang').parent().css('padding-left', '60px');
    } else if (Info.length <= 10 && Info.length > 8) {
        $('.icon-gantanhao-yuankuang').parent().css('padding-left', '50px');
    } else {
        $('.icon-gantanhao-yuankuang').parent().css('padding-left', '32px');
    }

    $('#warningInfo').text(Info);
    $('#warning').modal('show');
}