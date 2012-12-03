// Generated by CoffeeScript 1.4.0
var DEFAULTS, debug, defaults, existsSync, loadModules, overrideDefaults, path, resolvePath, strong, _ref;

path = require('path');

existsSync = require('../utils/fs').existsSync;

_ref = require('../utils/notify'), debug = _ref.debug, strong = _ref.strong;

DEFAULTS = {
  js: {
    compilers: ['./compilers/coffeescript', './compilers/typescript'],
    compressor: './compressor/uglifyjs',
    linter: './linter/jshint',
    module: './module/node'
  },
  css: {
    compilers: ['./compilers/less', './compilers/stylus'],
    compressor: './compressor/cleancss',
    linter: './linter/csslint',
    module: './module/css'
  },
  html: {}
};

defaults = null;

exports.installed = null;

exports.load = function(options, fn) {
  debug('PROCESSORS', 1);
  defaults = JSON.parse(JSON.stringify(DEFAULTS));
  options && overrideDefaults(options);
  return loadModules(function(err, processors) {
    if (err) {
      return fn(err);
    }
    return fn(null, exports.installed);
  });
};

resolvePath = function(processor, type) {
  var processorPath;
  processorPath = path.resolve(processor);
  if (!existsSync(processorPath + '.js')) {
    processorPath = path.resolve(__dirname, type, processor);
  }
  return processorPath;
};

overrideDefaults = function(options) {
  var category, processor, type, _results;
  debug('overriding defaults', 2);
  _results = [];
  for (category in options) {
    _results.push((function() {
      var _ref1, _results1,
        _this = this;
      _ref1 = options[category];
      _results1 = [];
      for (type in _ref1) {
        processor = _ref1[type];
        if (Array.isArray(defaults[category][type])) {
          if (!Array.isArray(processor)) {
            processor = [processor];
          }
          _results1.push(processor.forEach(function(plug) {
            debug("override " + category + "/" + type + " with: " + (strong(plug)), 3);
            return defaults[category][type].push(resolvePath(plug, type));
          }));
        } else {
          debug("override " + category + "/" + type + " with: " + (strong(processor)), 3);
          _results1.push(defaults[category][type] = resolvePath(processor, type));
        }
      }
      return _results1;
    }).call(this));
  }
  return _results;
};

loadModules = function(fn) {
  var category, idx, installed, proc, processor, type, _base, _base1, _i, _len, _ref1, _ref2, _ref3, _ref4;
  installed = {};
  for (category in defaults) {
    if ((_ref1 = installed[category]) == null) {
      installed[category] = {};
    }
    _ref2 = defaults[category];
    for (type in _ref2) {
      processor = _ref2[type];
      if (Array.isArray(processor)) {
        if ((_ref3 = (_base = installed[category])[type]) == null) {
          _base[type] = [];
        }
        for (idx = _i = 0, _len = processor.length; _i < _len; idx = ++_i) {
          proc = processor[idx];
          try {
            debug("load " + category + "/" + type + ":" + idx + " => " + (strong(proc)), 2);
            installed[category][type][idx] = require(proc);
          } catch (err) {
            return fn("failed loading processor " + (strong(proc)));
          }
        }
      } else {
        if ((_ref4 = (_base1 = installed[category])[type]) == null) {
          _base1[type] = {};
        }
        try {
          debug("load " + category + "/" + type + " => " + (strong(processor)), 2);
          installed[category][type] = require(processor);
        } catch (err) {
          return fn("failed loading processor " + (strong(processor)));
        }
      }
    }
  }
  exports.installed = installed;
  return fn();
};