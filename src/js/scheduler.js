(function ($) {
  'use strict';

  var serialize = function (data, accuracy) {
    accuracy = accuracy > 0 ? accuracy : 1;
    var chunkSize = 24 * accuracy;
    var res = [];
    var i = 0;
    for (i = 0; i < chunkSize * 7; i++) {
      res[i] = 0;
    }
    for (i = 0; i < 7; i++) {
      var row = data[i + 1];
      if (!row) {continue;}
      for (var j = 0, rowLen = row.length; j < rowLen; j++) {
        res[i * chunkSize + row[j]] = 1;
      }
    }

    return res.join('');
  };

  var parse = function (strSequence, accuracy) {
    accuracy = accuracy > 0 ? accuracy : 1;
    var chunkSize = 24 * accuracy;
    var res = {};
    for (var i = 0, row = 1, len = strSequence.length; i < len; i++) {
      var col = i % chunkSize;
      if (strSequence[i] === '1') {
        !res[row] && (res[row] = []);
        res[row].push(col);
      }
      if ((i + 1) % chunkSize === 0) {
        row++;
      }
    }

    return res;
  };

  var toStr = function (currentSelectRange) {
    return Object.prototype.toString.call(currentSelectRange);
  };
  // it only does '%s', and return '' when arguments are undefined
  var sprintf = function (str) {
    var args = arguments;
    var flag = true;
    var i = 1;

    str = str.replace(/%s/g, function () {
      var arg = args[i++];

      if (typeof arg === 'undefined') {
        flag = false;
        return '';
      }
      return arg;
    });
    return flag ? str : '';
  };

  /**
   * Return an interger array of ascending range form 'form' to 'to'.
   * @param {Number} form
   * @param {Number} to
   * @return {Array}
   */
  var makeRange = function (from, to) {
    // 保证 from <= to
    if (from > to) {
      from = from + to;
      to = from - to;
      from = from - to;
    }

    var res = [];
    for (var i = from; i <= to; i++) {
      res.push(i);
    }
    return res;
  };

  var makeMatrix = function (startCoord, endCoord) {
    var matrix = {};
    var colArr = makeRange(startCoord[1], endCoord[1]);
    var fromRow = startCoord[0] < endCoord[0] ? startCoord[0] : endCoord[0];
    var steps = Math.abs(startCoord[0] - endCoord[0]) + 1;
    for (var i = 0; i < steps; i++) {
      matrix[fromRow + i] = colArr.slice(0);
    }
    return matrix;
  };

  /**
   * Merge to arrays, return an new array.
   * @param {Array} origin
   * @param {Array} addition
   */
  var mergeArray = function (origin, addition) {
    var hash = {};
    var res = [];

    origin.forEach(function (item, i) {
      hash[item] = 1;
      res[i] = item;
    });

    addition.forEach(function (item) {
      if (!hash[item]) {
        res.push(item);
      }
    });

    return res.sort(function (num1, num2) {
      return num1 - num2;
    });
  };

  /**
   * 去当前数组中去除指定集合，返回新数组
   * @param {Array} origin 原数组
   * @param {Array} reject 要去除的数组
   */
  var rejectArray = function (origin, reject) {
    var hash = {};
    var res = [];

    reject.forEach(function (item, i) {
      hash[item] = i;
    });

    origin.forEach(function (item) {
      if (!hash.hasOwnProperty(item)) {
        res.push(item);
      }
    });

    return res.sort(function (num1, num2) {
      return num1 - num2;
    });
  };

  // 选择模式
  var SelectMode = {
    JOIN: 1, // 合并模式，添加到选区
    MINUS: 2, // 减去模式，从之前的选区中减去
    REPLACE: 3, // 替换模式，弃用之前的选区，直接使用给定的选区作为最终值
    NONE: 0
  };

  var Scheduler = function (el, options) {
    this.$el = $(el);
    if (!this.$el.is('table')) {
      this.$el = $('<table></table>').appendTo(this.$el);
    }

    // 自定义项
    this.options = options;
    // 选择模式
    this.selectMode = SelectMode.NONE;
    this.startCoord = null;
    this.endCoord = null;
    // 控件的数据对象，所有操作不会更改 this.options.data
    this.data = $.extend(true, {}, this.options.data);
    this.init();
  };

  // 默认项
  Scheduler.DEFAULTS = {
    locale: 'en', // i18n
    accuracy: 1, // how many cells of an hour
    data: [], // selected cells
    footer: true,
    multiple: true,
    disabled: false,
    // event callbacks
    onDragStart: $.noop,
    onDragMove: $.noop,
    onDragEnd: $.noop,
    onSelect: $.noop,
    onRender: $.noop
  };

  // Language
  Scheduler.LOCALES = {};

  // Simplified Chinese
  Scheduler.LOCALES['zh-cn'] = Scheduler.LOCALES.zh = {
    AM: '上午',
    PM: '下午',
    TIME_TITLE: '时间',
    WEEK_TITLE: '星期',
    WEEK_DAYS: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    DRAG_TIP: '可拖动鼠标选择时间段',
    RESET: '清空选择'
  };

  // English
  Scheduler.LOCALES['en-US'] = Scheduler.LOCALES.en = {
    AM: 'AM',
    PM: 'PM',
    TIME_TITLE: 'TIME',
    WEEK_TITLE: 'DAY',
    WEEK_DAYS: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    DRAG_TIP: 'Drag to select hours',
    RESET: 'Reset Selected'
  };

  // Template
  Scheduler.TEMPLATES = {
    HALF_DAY_ROW: '<tr>' +
      '<th rowspan="2" class="slash">' +
      '<div class="scheduler-time-title">%s</div>' +
      '<div class="scheduler-week-title">%s</div>' +
      '</th>' +
      '<th class="scheduler-half-toggle" data-half-toggle="1" colspan="%s">%s</th>' +
      '<th class="scheduler-half-toggle" data-half-toggle="2" colspan="%s">%s</th>' +
      '</tr>',
    HOUR_HEAD_CELL: '<th class="scheduler-hour-toggle" data-hour-toggle="%s" colspan="%s">%s</th>',
    DAY_ROW: '<tr data-index="%s"><td class="scheduler-day-toggle" data-day-toggle="%s">%s</td>%s</tr>',
    HOUR_CELL: '<td class="scheduler-hour%s" style="background-color: %s;" data-row="%s" data-col="%s"></td>',
    FOOT_ROW: '<tr><td colspan="%s"><span class="scheduler-tips">%s</span><a class="scheduler-reset">%s</a></td></tr>'
  };

  // Util
  Scheduler.Util = {
    parse: parse,
    serialize: serialize
  };

  var proto = Scheduler.prototype;

  proto.init = function () {
    this.initLocale();
    this.initTable();
    this.options.onRender.call(this.$el);
  };

  proto.initLocale = function () {
    var me = this;
    if (me.options.locale) {
      var parts = me.options.locale.toLowerCase().split(/-|_/);
      if (parts[1]) {
        parts[1] = parts[1].toUpperCase();
      }
      if ($.fn.scheduler.locales[me.options.locale]) {
        // locale as requested
        $.extend(me.options, $.fn.scheduler.locales[me.options.locale]);
      } else if ($.fn.scheduler.locales[parts.join('-')]) {
        // locale with sep set to - (in case original was specified with _)
        $.extend(me.options, $.fn.scheduler.locales[parts.join('-')]);
      } else if ($.fn.scheduler.locales[parts[0]]) {
        // short locale language code (i.e. 'en')
        $.extend(me.options, $.fn.scheduler.locales[parts[0]]);
      }
    }
  };

  proto.initTable = function () {
    this.$el.addClass('scheduler');
    if (this.options.disabled) {
      this.$el.addClass('scheduler-disabled');
    }
    this.initHead();
    this.initBody();
    if (this.options.footer) {
      this.initFoot();
    }
  };

  proto.initHead = function () {
    var me = this;
    me.$head = me.$el.find('>thead');
    if (!me.$head.length) {
      me.$head = $('<thead></thead>').appendTo(me.$el);
    }
    me.$head.append(me.getHeadHtml());
  };

  proto.initBody = function () {
    var me = this;

    me.$body = me.$el.find('>tbody');
    if (!me.$body.length) {
      me.$body = $('<tbody></tbody>').appendTo(me.$el);
    }
    me.$body.append(me.getBodyHtml(me.options.data));
  };

  proto.initFoot = function () {
    var me = this;
    me.$foot = me.$el.find('>tfoot');
    if (!me.$foot.length) {
      me.$foot = $('<tfoot></tfoot>').appendTo(me.$el);
    }
    me.$foot.append(me.getFootHtml());
  };

  proto.getHeadHtml = function (data) {
    var me = this;
    var options = me.options;
    me.$head.append(sprintf($.fn.scheduler.templates.HALF_DAY_ROW,
                            options.TIME_TITLE, // title: time
                            options.WEEK_TITLE, // title: week
                            me.options.accuracy * 12, // row span
                            options.AM, // title: 上午
                            me.options.accuracy * 12, // row span
                            options.PM // title: 下午
                           ));

    var hours = '';
    for (var i = 0; i < 24; i++) {
      hours += sprintf($.fn.scheduler.templates.HOUR_HEAD_CELL,
                       i, // hour indexs
                       options.accuracy, // row span
                       i // hour text
                      );
    }
    return sprintf('<tr>%s</tr>', hours);
  };

  proto.getFootHtml = function () {
    var me = this;
    var options = me.options;
    return sprintf(
      $.fn.scheduler.templates.FOOT_ROW,
      options.accuracy * 24 + 1,
      options.DRAG_TIP,
      options.RESET
    );
  };

  proto.getBodyHtml = function (data) {
    var me = this;
    var options = me.options;
    var rows = '';
    var cellOfRow = options.accuracy * 24;

    for (var i = 1; i <= 7; i++) {
      var cells = '';
      var selectedHours = data[i];
      for (var j = 0; j < cellOfRow; j++) {
        var appointment = selectedHours && selectedHours.hasOwnProperty(j);

        cells += sprintf(
          $.fn.scheduler.templates.HOUR_CELL,
          appointment ? ' scheduler-active' : '',
          appointment ? options.getCellColor(selectedHours[j]) : '',
          i,
          j
        );
      }
      rows += sprintf(
        $.fn.scheduler.templates.DAY_ROW,
        i,
        i,
        options.WEEK_DAYS[i - 1],
        cells
      );
    }

    return rows;
  };

  /**
   * 更新视图
   * @param {Object} data 选中的时间集合
   */
  proto.update = function (data) {
    this.$body.html(this.getBodyHtml(data));
  };

  proto.destroy = function () {
    this.$el.removeClass('scheduler').empty();
  };

  $.extend(Scheduler.DEFAULTS, Scheduler.LOCALES.zh);

  // SCHEDULER PLUGIN DEFINITION
  // ---------------------------

  var apiMethods = [
    'val',
    'destroy',
    'disable',
    'enable'
  ];

  // Set as a jQuery plugin
  $.fn.scheduler = function (option) {
    var value;
    var args = Array.prototype.slice.call(arguments, 1);

    this.each(function () {
      var $this = $(this);
      var data = $this.data('scheduler');
      var options = $.extend({}, Scheduler.DEFAULTS, $this.data(),
                         typeof option === 'object' && option);

      if (typeof option === 'string') {
        if ($.inArray(option, apiMethods) < 0) {
          throw new Error('Unknown method: ' + option);
        }

        if (!data) {
          return;
        }

        value = data[option].apply(data, args);

        if (option === 'destroy') {
          $this.removeData('scheduler');
        }
      }

      if (!data) {
        $this.data('scheduler', (data = new Scheduler(this, options)));
      }
    });

    return typeof value === 'undefined' ? this : value;
  };

  // Exports settings
  $.fn.scheduler.defaults = Scheduler.DEFAULTS;
  $.fn.scheduler.templates = Scheduler.TEMPLATES;
  $.fn.scheduler.locales = Scheduler.LOCALES;
  $.fn.scheduler.util = Scheduler.Util;
})(jQuery);
