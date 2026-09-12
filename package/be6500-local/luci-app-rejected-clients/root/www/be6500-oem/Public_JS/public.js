function Public() {
	/**
	 * 根据ID得到对象
	 */
	this.GetObj = function (id) {
		return document.getElementById(id);
	};
	/**
	 * 根据ID得到对象的值
	 */
	this.GetValue = function (id) {
		var obj = document.getElementById(id);
		if (obj !== null) {
			return obj.value;
		}
		return null;
	}
}

Public.prototype = {
	/**
	 * MAC地址验证，格式为00:00:00:00:00:00
	 */
	checkMac: function (str) {
		var reg = /^[A-Fa-f\d]{2}:[A-Fa-f\d]{2}:[A-Fa-f\d]{2}:[A-Fa-f\d]{2}:[A-Fa-f\d]{2}:[A-Fa-f\d]{2}$/;
		if (!reg.test(str)) {
			return false;
		} else {
			return true;
		}
	},
	/**
	 * 对输入的Mask地址进行校验。
	 * @param {String} mask 待验证的掩码字符串。
	 * @return {Boolean} 掩码是否正确的布尔值。
	 */
	checkMask: function (sMask) {
		/* 有效性校验 */
		var IPPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
		if (!IPPattern.test(sMask))
			return false;

		/* 检查域值 */
		var IPArray = sMask.split(".");
		if (IPArray.length != 4)
			return false;

		/* 网络掩码的第一字节最小为192,第四字节最大为252 */
		if (parseInt(IPArray[0]) < 192 && parseInt(IPArray[0]) != 0)
			return false;

		for (var i = 0; i < 4; i++) {
			/* 每项值必须是以下值才能通过 */
			switch (parseInt(IPArray[i])) {
				case 0:
					break;
				case 128:
				case 192:
				case 224:
				case 240:
				case 248:
				case 252:
				case 254:
				case 255: {
					if (i > 0) {
						if (parseInt(IPArray[i - 1]) != 255) {
							return false;
						}
					}
					break;
				}
				default:
					return false;
			}
		}

		return true;
	},
	/**
	 * 检查一个对象是否存在于数组中。
	 * @param {Object} o 待检查的对象
	 * @param {Number} from (Optional) 查询起始位置的索引值
	 * @return {Number} 返回对象在数组中的索引值(如果没有找到则返回-1)
	 */
	indexOf: function (o, from) {
		var len = this.length;
		from = from || 0;
		from += (from < 0) ? len : 0;
		for (; from < len; ++from) {
			if (this[from] === o) {
				return from;
			}
		}
		return -1;
	},
	/**
	 * 去除字符串前后的空白字符
	 */
	trims: function (str) {
		return str.replace(/(^\s*)|(\s*$)/g, '');
	},
	/**
	 * 判断字符串是否存在中文
	 */
	isChina: function (str) {
		var patrn = /[\u4E00-\u9FA5]|[\uFE30-\uFFA0]/gi;
		if (!patrn.exec(str)) {
			return false;
		} else {
			return true;
		}
	},
	/**
	 * 合并两个数组，并保持数组中元素的唯一性
	 * @param {Array} arr 要找到并将其删除的对象
	 * @return {Array} 返回合并后的数组
	 */
	unique: function (arr) {
		if (!Util.isArray(arr)) {
			arr = [];
		}

		for (var i = 0; i < arr.length; i++) {
			if ($.inArray(arr[i], this) == -1) {
				this.push(arr[i]);
			}
		}
		return this;
	},
	/**
	 * 从数组中删除指定对象，如果没有在数组中找到该对象则不做任何操作。
	 * @param {Object} o 要找到并将其删除的对象
	 * @return {Array} 返回数组本身
	 */
	remove: function (o) {
		var index = this.indexOf(o);
		if (index != -1) {
			this.splice(index, 1);
		}
		return this;
	},
	/**
	 * 检查一个对象是否存在于数组中。
	 * @param {Object} o 待检查的对象
	 * @param {Number} from (Optional) 查询起始位置的索引值
	 * @return {Number} 返回对象在数组中的索引值(如果没有找到则返回-1)
	 */
	indexOf: function (o, from) {
		var len = this.length;
		from = from || 0;
		from += (from < 0) ? len : 0;
		for (; from < len; ++from) {
			if (this[from] === o) {
				return from;
			}
		}
		return -1;
	},
	/**
	 * 检测是否是IP字符串
	 */
	isIP: function (strIP) {
		var exp = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/;
		var reg = strIP.match(exp);
		if (reg == null) {
			return false;
		} else {
			return true;
		}
	},
	/**
	 * 判断是否已存在某个class名
	 */
	hasClass: function (el, className) {
		var reg = new RegExp('(^|\\s)' + className + '(\\s|$)');
		return reg.test(el.className);
	},
	/**
	 * 格式化日期时间
	 * momentFormat(time，'YYYY-MM-DD HH:mm:ss')
	 */
	momentFormat: function (time, format) {
		return moment(time).format(format)
	},
	/**
	 *用途：判断是否是日期 
	 *输入：date：日期；fmt：日期格式 
	 *返回：如果通过验证返回true,否则返回false 
	 */
	getMaxDay: function (year, month) {
		if (month == 4 || month == 6 || month == 9 || month == 11)
			return "30";
		if (month == 2)
			if (year % 4 == 0 && year % 100 != 0 || year % 400 == 0)
				return "29";
			else
				return "28";
		return "31";
	},
	isDate: function (date, fmt) {
		if (fmt == null) fmt = "yyyy/MM/dd";
		var yIndex = fmt.indexOf("yyyy");
		if (yIndex == -1) return false;
		var year = date.substring(yIndex, yIndex + 4);
		var mIndex = fmt.indexOf("MM");
		if (mIndex == -1) return false;
		var month = date.substring(mIndex, mIndex + 2);
		var dIndex = fmt.indexOf("dd");
		if (dIndex == -1) return false;
		var day = date.substring(dIndex, dIndex + 2);
		if (!isNumber(year) || year > "2100" || year < "1900") return false;
		if (!isNumber(month) || month > "12" || month < "01") return false;
		if (day > this.getMaxDay(year, month) || day < "01") return false;
		return true;
	},
	/**
	 *用途：检查输入的起止日期是否正确，规则为两个日期的格式正确， 且结束如期>=起始日期 
	 *输入： 
	 *startDate：起始日期，字符串 
	 *endDate：结束如期，字符串 
	 *返回： 
	 *如果通过验证返回true,否则返回false 
	 */
	checkTwoDate: function (startDate, endDate) {
		if (!isDate(startDate)) {
			//	console.log("起始日期不正确!");
			return false;
		} else if (!isDate(endDate)) {
			//	console.log("终止日期不正确!");
			return false;
		} else if (startDate > endDate) {
			//	console.log("起始日期不能大于终止日期!");
			return false;
		}
		return true;
	},
	/**
	 *阻止事件冒泡
	 */
	stopEventPropagation: function () {
		if (event.stopPropagation) {
			// this code is for Mozilla and Opera 
			event.stopPropagation();
		} else if (window.event) {
			// this code is for IE 
			window.event.cancelBubble = true;
		}
	},
	/**
	 *克隆对象
	 */
	clone: function (obj) {
		var o;
		switch (typeof obj) {
			case 'undefined':
				break;
			case 'string':
				o = obj + '';
				break;
			case 'number':
				o = obj - 0;
				break;
			case 'boolean':
				o = obj;
				break;
			case 'object':
				if (obj === null) {
					o = null;
				} else {
					o = JSON.parse(JSON.stringify(obj));
				}
				break;
			default:
				o = obj;
				break;
		}
		return o;
	}
}

var publicModel = new Public();