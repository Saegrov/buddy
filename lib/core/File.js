// Generated by CoffeeScript 1.4.0
var File, RE_BUILT_HEADER, async, debug, existsSync, fs, path, strong, _ref;

fs = require('fs');

path = require('path');

async = require('async');

_ref = require('../utils/notify'), debug = _ref.debug, strong = _ref.strong;

existsSync = require('../utils/fs').existsSync;

RE_BUILT_HEADER = /^\/\*BUILT/g;

module.exports = function(type, filepath, basepath, processors, fn) {
  var compiler, extension, name, valid, _ref1;
  filepath = path.resolve(filepath);
  if (!existsSync(filepath)) {
    return fn("" + (strong(filepath)) + " not found in project path");
  }
  extension = path.extname(filepath).slice(1);
  if (extension === type) {
    valid = true;
  } else {
    _ref1 = processors.compilers;
    for (name in _ref1) {
      compiler = _ref1[name];
      if (extension === compiler.extension) {
        valid = true;
        break;
      }
    }
  }
  if (!valid) {
    return fn("invalid file type " + (strong(path.relative(process.cwd(), filepath))));
  } else {
    return fn(null, new File(type, filepath, basepath, compiler, processors.module));
  }
};

File = (function() {

  function File(type, filepath, basepath, compiler, module) {
    this.type = type;
    this.filepath = filepath;
    this.basepath = basepath;
    this.compiler = compiler;
    this.module = module;
    this.name = path.basename(this.filepath);
    this.qualifiedName = path.relative(this.basepath, this.filepath).replace(path.extname(this.name), '');
    this.needsCompile = this.compiler != null;
    this.moduleID = this.module.getModuleID(this.qualifiedName);
    this.dependencies = [];
    this.isDependency = false;
    this.content = '';
    debug("created " + this.type + " File instance " + (strong(path.relative(process.cwd(), this.filepath))) + " with moduleID: " + (strong(this.moduleID)), 3);
  }

  File.prototype.parseContent = function(compile, fn) {
    var _this = this;
    if (this.content) {
      return process.nextTick(function() {
        return fn();
      });
    } else {
      return fs.readFile(this.filepath, 'utf8', function(err, content) {
        if (err) {
          return fn(err);
        }
        if (content.match(RE_BUILT_HEADER)) {
          return fn();
        }
        _this.dependencies = _this.module.getModuleDependencies(content, _this.moduleID);
        if (compile && _this.needsCompile) {
          return _this.compiler.compile(content, function(err, compiled) {
            if (err) {
              return fn(err);
            }
            debug("compiled: " + (strong(path.relative(process.cwd(), _this.filepath))), 3);
            _this.content = compiled;
            return fn();
          });
        } else {
          _this.content = content;
          return fn();
        }
      });
    }
  };

  File.prototype.reset = function() {
    this.dependencies = [];
    return this.isDependency = false;
  };

  File.prototype.destroy = function() {
    this.reset();
    this.content = '';
    this.compiler = null;
    return this.module = null;
  };

  return File;

})();