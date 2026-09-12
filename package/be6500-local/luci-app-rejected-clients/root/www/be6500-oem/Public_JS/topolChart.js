$(document).ready(function () {
  var sessionid = $.cookie("sessionid");
  var HostAddrIP = $.cookie("HostAddrIP");

  var topolDataArr = [];
  var topolDataTotol = [];
  var topolData = [];
  var guanxiArr = [];
  var links = [];

  get_device_list();
  get_primary_route_info();

  $('.arrow_right').on('click', function () {
    let page = Number($(this).parent().attr('data-page'));
    let childData = topolDataArr.slice(1);
    if(page + 5 >= childData.length + 1) {
      return;
    }
    page += 1;
    $(this).parent().attr('data-page', page);
    topolDataTotol = initTopolData(page, topolDataArr);
    links = initChartLinks(topolData, guanxiArr);
    drawDiveceTopol(topolDataTotol, links);
	})

	$('.arrow_left').on('click', function () {
    let page = Number($(this).parent().attr('data-page'));
    if(page <= 1) {
      return;
    }
    page -= 1;
    $(this).parent().attr('data-page', page);
    topolDataTotol = initTopolData(page, topolDataArr);
    links = initChartLinks(topolData, guanxiArr);
    drawDiveceTopol(topolDataTotol, links);
	})

  $.when(get_device_list, get_primary_route_info).done(function () {
    setInterval(function () {
      let page = Number($('.topol-com-wrap').attr('data-page'));
      topolDataTotol = initTopolData(page, topolDataArr);
      links = initChartLinks(topolData, guanxiArr);
      drawDiveceTopol(topolDataTotol, links);
    }, 3000);
  })

  function get_primary_route_info() {
    $.ajax({
      url: 'http://' + HostAddrIP + '/jdcapi',
      data: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "call",
        "params": [
          sessionid,
          "jdcapi.static",
          "get_wan_info",
          {}
        ]
      }),
      dataType: 'json',
      type: 'POST',
      async: false,
      success: function (r) {
        if (!r.hasOwnProperty("error")) {
          if (r.result[0] == 0) {
            var primary_route_info = {};
            primary_route_info['id'] = r.result[1].macaddr;
            var ip = "";

            var dhcp_info_obj = r.result[1].dhcp_info;
            var static_info_obj = r.result[1].static_info;
            var pppoe_info_obj = r.result[1].pppoe_info;
            var wds_info_obj = r.result[1].wds_info;

            if (r.result[1].proto == "dhcp") {
              ip = dhcp_info_obj.ipaddr;
            } else if (r.result[1].proto == "static") {
              ip = static_info_obj.ipaddr;
            } else if (r.result[1].proto == "pppoe") {
              ip = pppoe_info_obj.ipaddr;
            } else if (r.result[1].proto == "wds") {
              ip = wds_info_obj.ipaddr;
            }
            primary_route_info['ip'] = ip;
            primary_route_info['online'] = "1";
            primary_route_info['name'] = "京东云无线宝金吒";
            topolDataArr.unshift(primary_route_info);
            return primary_route_info;
          }
        } else if (r.error.code == "-32002" && r.error.message == "Access denied") {
          top.location.href = 'http://' + gohref_ip() + '/index.html';
        }
      },
      error: function () {
        document.onreadystatechange = function () {
          if (document.readyState == "complete") {
            top.location.href = 'http://' + gohref_ip() + '/index.html';
          }
        }
      }
    })
  }

  function get_device_list() {
    $.ajax({
      type: "post",
      url: "http://" + HostAddrIP + "/jdcapi",
      dataType: "json",
      contentType: "application/json",
      async: false,
      data: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "call",
        "params": [
          sessionid,
          "jdcapi.static",
          "web_get_device_list",
          {}
        ]
      }),
      success: function (data) {
        if (!data.hasOwnProperty("error")) {
          if (data.result[0] == 0) {
            var devices =  data.result[1].device_list;
            var devices_online = devices.filter(function (item) {
              if (item.online == "1") {
                return item;
              }
            })
            topolDataArr = topolDataArr.concat(devices_online);
            return devices_online;
          }
        } else if (data.error.code == "-32002" && data.error.message == "Access denied") {
          top.location.href = 'http://' + gohref_ip() + '/index.html';
        }
      },
      error: function () {
        window.parent.hintShaed("系统错误，请重新操作", 'icon-gantanhao-yuankuang');
      }
    })
  };

  function initTopolData(page, data) {
    var chartConWidth = $(".topol-com").width();

    let mainData = data.slice(0, 1);
    let childData = data.slice(page, page + 5);
    let totalData = mainData.concat(childData);
    var len = totalData.length;
    $.each(totalData, function (index, val) {
      topolData[index] = {};
      if(len == 1) {
        //主路由
        topolData[index]['x'] = chartConWidth / 2;
        topolData[index]['y'] = chartConWidth / 2;
      } else if(len > 1) {
        if (index == 0) {
          // 主路由
          topolData[index]['x'] = chartConWidth / 2;
          topolData[index]['y'] = 0;
        } else {
          // 子路由
          let childLen = totalData.slice(1).length;
          let idx = index - 1;
          if(childLen == 1) {
            topolData[index]['x'] = chartConWidth / 2;
          } else {
            topolData[index]['x'] = (chartConWidth / (childLen - 1)) * idx;
          }
          topolData[index]['y'] = 250;
        }
      }
      
      topolData[index]['symbolSize'] = 60;
      topolData[index]['name'] = val.id; // name是唯一标识，名字不可替换
      topolData[index]['macName'] = val.name;
      topolData[index]['ip'] = val.ip;
      topolData[index]['value'] = val.ip;
      topolData[index]['is_agent'] = val.is_agent;
      if (val.is_agent) {
        //子路由
        topolData[index]['symbol'] = "image://../../P_IMG/child-route-jinzha.png";
      } else {
        topolData[index]['symbol'] = "image://../../P_IMG/device.png";
      }

      guanxiArr[index] = {};
      if(len == 1) {
        //主路由
        guanxiArr[index]['x'] = chartConWidth / 2;
        guanxiArr[index]['y'] = chartConWidth / 2;
      } else if(len > 1) {
        let childLen = totalData.slice(1).length;
        if (index == 0) {
          // 主路由
          guanxiArr[index]['x'] = chartConWidth / 2;
          if(childLen == 1) {
            guanxiArr[index]['y'] = 300;
          } else {
            guanxiArr[index]['y'] = 150;
          }
        } else {
          // 子路由
          let idx = index - 1;
          if(childLen == 1) {
            guanxiArr[index]['x'] = chartConWidth / 2;
            guanxiArr[index]['y'] = 300;
          } else {
            guanxiArr[index]['x'] = (chartConWidth / (childLen - 1)) * idx;
            guanxiArr[index]['y'] = 150;
          }
        }
      }
      guanxiArr[index]['name'] = index;
      guanxiArr[index]['symbolSize'] = 0;
      guanxiArr[index]['value'] = index;

    }, len, chartConWidth);
    topolData[0]['symbol'] = "image://../../P_IMG/primary-route-jinzha.png";
    topolDataTotol = topolData.concat(guanxiArr);
    return topolDataTotol;
  }

  function initChartLinks(topolData) {
    var links = [];
    var lastIndex = topolData.length - 1;

    links.push({
      source: topolData[0].name,
      target: '0',
    });
    for (var i = 1; i < topolData.length; i++) {
      links.push({
        source: String(i),
        target: topolData[i].name,
      });
    }
    links.push({
      source: '1',
      target: String(lastIndex),
      symbol: 'none',
    });
    return links;
  }

  function drawDiveceTopol(data, links) {
    var myChart = echarts.init(document.getElementById('topol-com'), 'macarons');
    //具体的绘制流程图的方法
    var option = {
      textStyle: {
        color: '#000'
      },
      series: [{
        type: 'graph',
        layout: 'none',
        symbolSize: 10,
        roam: false,
        label: {
          normal: {
            show: true,
            position: 'bottom',
            distance: 15,
            textStyle: {
              fontSize: 12,
              color: '#4c4c4c',
              fontWeight: 'normal',
            },
            formatter: function (params) {
              var deviceInfo = "MAC:" + params.data.name + "\nIP:" + params.data.ip + "\n" + params.data.macName;
              return deviceInfo;
            },
          }
        },
        data: data,

        //这是点与点之间的连接关系
        links: links,

        //线条的颜色
        lineStyle: {
          normal: {
            opacity: 0.9,
            color: '#53B5EA',
            type: 'dashed',
            width: 1
          }
        }
      }]
    };

    // 使用刚指定的配置项和数据显示图表。
    myChart.setOption(option);

    let page = Number($('.topol-com-wrap').attr('data-page'));
    let childData = topolDataArr.slice(1);
    
    if(childData.length <= 5) {
      $('.arrow_left').hide();
      $('.arrow_right').hide();
    } else {
      if(page + 5 >= childData.length + 1) {
        $('.arrow_left').show();
        $('.arrow_right').hide();
      } else if (page <= 1) {
        $('.arrow_left').hide();
        $('.arrow_right').show();
      } else {
        $('.arrow_left').show();
        $('.arrow_right').show();
      }
    }
    
    myChart.on('click', function (params) {
      if (params.dataType == 'node') {
        if (params.data.is_agent == 1) {
          url = "http://" + params.data.ip
          window.open(url,"jdcwifi");
        }
      }
    })
  }
});
  