$(document).ready(function () {
  const model = $.cookie("model");
  if (model === 'ZFXY-CRB') {
    document.title = '中扶星云CRB'
  } else {
    document.title = '京东云无线宝'
  }
});