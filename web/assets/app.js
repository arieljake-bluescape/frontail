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

  /**
   * @type {String}
   * @private
   */
  var _filterValue = '';

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
   * Hide element if doesn't contain filter value
   *
   * @param {Object} element
   * @private
   */
  var _filterElement = function(elem) {
    var pattern = new RegExp(_filterValue, 'i');
    var element = elem;
    if (pattern.test(element.textContent)) {
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  };

  /**
   * Filter logs based on _filterValue
   *
   * @function
   * @private
   */
  var _filterLogs = function() {
    var collection = _logContainer.childNodes;
    var i = collection.length;

    if (i === 0) {
      return;
    }

    while (i) {
      _filterElement(collection[i - 1]);
      i -= 1;
    }
    window.scrollTo(0, document.body.scrollHeight);
  };

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
  var _isScrolledBottom = function() {
    var currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
    var totalHeight = document.body.offsetHeight;
    var clientHeight = document.documentElement.clientHeight; // eslint-disable-line
    return totalHeight <= currentScroll + clientHeight;
  };

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
  var _highlightLine = function(line, container) {
    if (_highlightConfig && _highlightConfig.lines) {
      Object.keys(_highlightConfig.lines).forEach((lineCheck) => {
        if (line.indexOf(lineCheck) !== -1) {
          container.setAttribute('style', _highlightConfig.lines[lineCheck]);
        }
      });
    }

    return container;
  };

  var _selectFlow = function(flow) {
    _selectedFlow = flow;
    _refreshLog();
    _logContainer.scrollTo(0, 0);
  };

  var _printLogEntry = function(data) {
    const msg = data.msg || `<pre>${JSON.stringify(data, null, '  ')}</pre>`;
    const itemDiv = document.createElement('div');
    const item = `
<div>
<div style="font-size: 16px; margin-top: 5px;">${msg}</div>
</div>`;
    itemDiv.innerHTML = _highlightWord(item);

    _filterElement(itemDiv);
    _logContainer.appendChild(itemDiv);

    // const wasScrolledBottom = _isScrolledBottom();

    // if (wasScrolledBottom) {
    //   window.scrollTo(0, document.body.scrollHeight);
    // }

    _updateFaviconCounter();
  };

  var _refreshLog = function() {
    _logContainer.innerHTML = '';

    if (!_selectedFlow) return;

    _selectedFlow.entries.forEach((entry) => {
      _printLogEntry(entry);
    });
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
      _filterInput.focus();
      _topbar = opts.topbar;
      _body = opts.body;

      _setFilterValueFromURL(_filterInput, window.location.toString());

      // Filter input bind
      _filterInput.addEventListener('keyup', function(e) {
        // ESC
        if (e.keyCode === 27) {
          this.value = '';
          _filterValue = '';
        } else {
          _filterValue = this.value;
        }
        _setFilterParam(_filterValue, window.location.toString());
        _filterLogs();
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
      let data = JSON.parse(entry);

      if (data.msg && data.msg[0] === '{') {
        data = Object.assign({
          _name: data.name,
          _file: data.src.file,
          _func: data.src.func
        }, JSON.parse(data.msg));
      }
      else {
        data = {
          time: data.time,
          name: data.name,
          msg: data.msg,
          file: data.src.file,
          func: data.src.func
        };
      }
      // data = JSON.stringify(data, null, '  ');
      // data = ansi_up.escape_for_html(data); // eslint-disable-line
      // data = ansi_up.ansi_to_html(data); // eslint-disable-line
      // data = `\n${data}`;
      const name = data.name || data._name;
      const id = name.substr(name.indexOf(':') + 1);

      if (!id || /\d{4}\-/.test(id) === false || name.indexOf('bs.services.mq') >= 0
        || name.indexOf('bs.worker') >= 0) {
        return;
      }

      let flow = _flows[id];

      if (!flow) {
        flow = {
          id,
          entries: []
        };

        flow.div = document.createElement('div');
        flow.div.setAttribute('data-id', id);
        flow.div.style.margin = '10px';
        flow.div.style.borderBottom = '1px solid #666';
        flow.div.style.cursor = 'pointer';
        flow.div.innerHTML = `
        <div>${id}</div>
<div style="font-size: 12px;">
  <span>${name.split(':')[0]}</span>
</div>`;
        flow.div.addEventListener('click', function() {
          _selectFlow(flow);
        });

        _flowContainer.appendChild(flow.div);
        if (_flowContainer.children.length > _flowsLimit) {
          _flowContainer.removeChild(_flowContainer.children[0]);
        }

        _flows[id] = flow;
      }

      flow.entries.push(data);

      if (_selectedFlow && flow.id === _selectedFlow.id) {
        _printLogEntry(data);
      }
    }
  };
}(window, document));
