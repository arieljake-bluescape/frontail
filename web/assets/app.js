/* global Tinycon:false, ansi_up:false */

window.App = (function app(window, document) {
  'use strict';

  /**
   * @type {Object}
   * @private
   */
  var _socket;

  /**
   * @type {HTMLElement}
   * @private
   */
  var _logContainer;

  /**
   * @type {HTMLElement}
   * @private
   */
  var _flowContainer;
  var _flows = {};
  var _selectedFlow;

  /**
   * @type {HTMLElement}
   * @private
   */
  var _filterInput;
  var _minTimeInput;

  /**
   * @type {String}
   * @private
   */
  var _filterValue = null;
  var _minTimeValue = '';

  /**
   * @type {HTMLElement}
   * @private
   */
  var _topbar;

  /**
   * @type {HTMLElement}
   * @private
   */
  var _body;

  /**
   * @type {number}
   * @private
   */
  var _linesLimit = Math.Infinity;
  var _flowsLimit = 200;

  /**
   * @type {number}
   * @private
   */
  var _newLinesCount = 0;

  /**
   * @type {boolean}
   * @private
   */
  var _isWindowFocused = true;

  /**
   * @type {object}
   * @private
   */
  var _highlightConfig;

  /**
   * Set _filterValue from URL parameter `filter`
   *
   * @function
   * @private
   */
  var _setFilterValueFromURL = function(filterInput, uri) {
    var _url = new URL(uri);
    var _filterValueFromURL = _url.searchParams.get('filter');
    if (typeof _filterValueFromURL !== 'undefined' && _filterValueFromURL !== null) {
      _filterValue = _filterValueFromURL;
      filterInput.value = _filterValue; // eslint-disable-line
    }
  };

  /**
   * Set parameter `filter` in URL
   *
   * @function
   * @private
   */
  var _setFilterParam = function(value, uri) {
    var _url = new URL(uri);
    var _params = new URLSearchParams(_url.search.slice(1));
    if (value === '') {
      _params.delete('filter');
    } else {
      _params.set('filter', value);
    }
    _url.search = _params.toString();
    window.history.replaceState(null, document.title, _url.toString());
  };

  /**
   * @return {Boolean}
   * @private
   */
  // var _isScrolledBottom = function() {
  //   var currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
  //   var totalHeight = document.body.offsetHeight;
  //   var clientHeight = document.documentElement.clientHeight; // eslint-disable-line
  //   return totalHeight <= currentScroll + clientHeight;
  // };

  /**
   * @return void
   * @private
   */
  var _faviconReset = function() {
    _newLinesCount = 0;
    Tinycon.setBubble(0);
  };

  /**
   * @return void
   * @private
   */
  var _updateFaviconCounter = function() {
    if (_isWindowFocused) {
      return;
    }

    if (_newLinesCount < 99) {
      _newLinesCount += 1;
      Tinycon.setBubble(_newLinesCount);
    }
  };

  /**
   * @return String
   * @private
   */
  var _highlightWord = function(line) {
    var output = line;

    if (_highlightConfig && _highlightConfig.words) {
      Object.keys(_highlightConfig.words).forEach((wordCheck) => {
        output = output.replace(
          wordCheck,
          '<span style="' + _highlightConfig.words[wordCheck] + '">' + wordCheck + '</span>'
        );
      });
    }

    return output;
  };

  /**
   * @return HTMLElement
   * @private
   */
  // var _highlightLine = function(line, container) {
  //   if (_highlightConfig && _highlightConfig.lines) {
  //     Object.keys(_highlightConfig.lines).forEach((lineCheck) => {
  //       if (line.indexOf(lineCheck) !== -1) {
  //         container.setAttribute('style', _highlightConfig.lines[lineCheck]);
  //       }
  //     });
  //   }

  //   return container;
  // };

  var _filterLogEntries = function(data) {
    if (/\d{4}-/.test(data._flowId) === false
      || data._name.indexOf('bs.services.mq') >= 0
      || data._name.indexOf('bs.worker') >= 0) {
      return false;
    }

    if (_filterValue) {
      return _filterValue.test(data._entry);
    }

    return true;
  };

  var _filterFlows = function(flow) {
    if (_minTimeValue) {
      return flow.id >= _minTimeValue;
    }
    
    return true;
  }

  var _printLogEntry = function(data) {
    // data = ansi_up.escape_for_html(data); // eslint-disable-line
    // data = ansi_up.ansi_to_html(data); // eslint-disable-line

    const msg = JSON.stringify(data, null, '  ');
    const itemDiv = document.createElement('div');
    const item = `
<div>
<div style="font-size: 16px; margin-top: 5px;"><pre>${msg}</pre></div>
</div>`;
    itemDiv.innerHTML = _highlightWord(item);
    _logContainer.appendChild(itemDiv);
  };

  var _refreshFlows = function() {
    _flowContainer.innerHTML = '';

    const flows = Object.values(_flows).sort((f1, f2) => {
      if (f1.id > f2.id) return -1;
      if (f2.id > f1.id) return 1;
      return 0;
    });
    
    flows
      .filter(_filterFlows)
      .forEach((flow) => {
        const flowDiv = document.createElement('div');
        flowDiv.setAttribute('data-id', flow.id);
        flowDiv.style.margin = '10px';
        flowDiv.style.borderBottom = '1px solid #666';
        flowDiv.style.cursor = 'pointer';
        flowDiv.innerHTML = `
        <div>${flow.id}</div>
  <div style="font-size: 12px;">
  <div>${flow.entries[0]._name.split(':')[0].split('.').slice(-2, -1).pop()}</div>
  <div style="font-weight: bold">${flow.entries[0]._name.split(':')[0].split('.').slice(-1).pop()}</div>
  </div>`;
        flowDiv.addEventListener('click', function() {
          _selectFlow(flow);
        });

        _flowContainer.appendChild(flowDiv);
      });
  };

  var _refreshLog = function() {
    _logContainer.innerHTML = '';

    if (!_selectedFlow) return;

    _selectedFlow.entries
      .filter(_filterLogEntries)
      .forEach((entry) => {
        _printLogEntry(entry);
      });

    _updateFaviconCounter();
  };

  var _selectFlow = function(flow) {
    _selectedFlow = flow;
    _refreshLog();
    _refreshFlows();
    _logContainer.scrollTo(0, 0);
  };

  return {
    /**
     * Init socket.io communication and log container
     *
     * @param {Object} opts options
     */
    init: function init(opts) {
      var self = this;

      // Elements
      _logContainer = opts.logContainer;
      _flowContainer = opts.flowContainer;
      _filterInput = opts.filterInput;
      _minTimeInput = opts.minTimeInput;
      _topbar = opts.topbar;
      _body = opts.body;

      // _setFilterValueFromURL(_filterInput, window.location.toString());

      // Filter input bind
      _filterInput.addEventListener('keyup', function(e) {
        // ESC
        if (e.keyCode === 27) {
          this.value = '';
          _filterValue = null;
        } else {
          _filterValue = new RegExp(this.value, 'i');
        }
        // _setFilterParam(this.value, window.location.toString());
        _refreshLog();
      });
      
      _minTimeInput.addEventListener('keyup', function(e) {
        // ESC
        if (e.keyCode === 27) {
          this.value = '';
          _minTimeValue = '';
        } else {
          _minTimeValue = this.value;
        }
        // _setFilterParam(_minTimeValue, window.location.toString());
        _refreshFlows();
      });

      // Favicon counter bind
      window.addEventListener(
        'blur',
        function() {
          _isWindowFocused = false;
        },
        true
      );
      window.addEventListener(
        'focus',
        function() {
          _isWindowFocused = true;
          _faviconReset();
        },
        true
      );

      // socket.io init
      _socket = opts.socket;
      _socket
        .on('options:lines', function(limit) {
          _linesLimit = limit;
        })
        .on('options:hide-topbar', function() {
          _topbar.className += ' hide';
          _body.className = 'no-topbar';
        })
        .on('options:no-indent', function() {
          _logContainer.className += ' no-indent';
        })
        .on('options:highlightConfig', function(highlightConfig) {
          _highlightConfig = highlightConfig;
        })
        .on('line', function(line) {
          self.log(line);
        });
    },

    /**
     * Log data
     *
     * @param {string} data data to log
     */
    log: function log(entry) {
      const data = JSON.parse(entry);
      let logData;

      if (data.msg && data.msg[0] === '{') {
        logData = JSON.parse(data.msg);
      } else if (data.event) {
        logData = {
          event: data.event
        };
      } else if (data.data) {
        logData = {
          data: data.data
        };
      } else if (data.error) {
        logData = {
          error: data.error
        };
      } else {
        logData = {
          msg: data.msg
        };
      }

      Object.assign(logData, {
        _time: data.time,
        _name: data.name || data._name,
        _file: data.src ? data.src.file : null,
        _func: data.src ? data.src.func : null,
        _entry: entry
      });

      if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.exec(logData._name)) {
        return;
      }

      logData._flowId = logData._name.substr(logData._name.indexOf(':') + 1);

      let flow = _flows[logData._flowId];

      if (!flow) {
        flow = {
          id: logData._flowId,
          entries: [logData]
        };

        _flows[logData._flowId] = flow;
        _refreshFlows();
      }
      else {
        flow.entries.push(logData);
      }

      if (_selectedFlow && flow.id === _selectedFlow.id) {
        _printLogEntry(logData);
      }
    }
  };
}(window, document));
