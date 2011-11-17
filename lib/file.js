var CSSFile, File, JSFile, fs, log, path;
var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

fs = require('fs');

path = require('path');

log = console.log;

exports.File = File = (function() {

  function File(filepath, base) {
    this.filepath = filepath;
    this.base = base;
    this.filename = path.basename(this.filepath);
    this.name = this.filename.replace(path.extname(this.filename), '');
    this.contents = null;
    this.compile = false;
    this.lastChange = null;
    this.lastSize = null;
  }

  File.prototype.updateContents = function(contents) {
    return this.contents = contents;
  };

  return File;

})();

exports.JSFile = JSFile = (function() {

  __extends(JSFile, File);

  JSFile.prototype.RE_COFFEE_EXT = /\.coffee$/;

  JSFile.prototype.RE_JS_EXT = /\.js$/;

  JSFile.prototype.RE_INDENT_WHITESPACE = /(^\t|^ +)\S/m;

  JSFile.prototype.RE_LINE_BEGIN = /^/gm;

  JSFile.prototype.RE_UPPERCASE = /[A-Z]/;

  JSFile.prototype.RE_REQUIRE = /^(?=.*?require\s*\(?\s*['|"]([^'"]*))(?:(?!#|(?:\/\/)).)*$/gm;

  JSFile.prototype.RE_MODULE = /(?:^|[^\w\$_.])require\.module\s*\(?\s*['|"]([^'"]*)/;

  function JSFile(filepath, base, contents) {
    JSFile.__super__.constructor.call(this, filepath, base);
    this.compile = this.RE_COFFEE_EXT.test(this.filepath);
    this.module = this._getModuleName();
    this.updateContents(contents || fs.readFileSync(this.filepath, 'utf8'));
    this.dependencies = this._getModuleDependencies();
  }

  JSFile.prototype.updateContents = function(contents) {
    var indent;
    if (!this.RE_MODULE.test(contents)) {
      if (this.compile) {
        indent = contents.match(this.RE_INDENT_WHITESPACE)[1] || '\t';
        return this.contents = "require.module '" + this.module + "', (module, exports, require) ->\n" + (contents.replace(this.RE_LINE_BEGIN, indent));
      } else {
        return this.contents = "`require.module('" + this.module + "', function(module, exports, require) {\n" + contents + "\n});`";
      }
    } else {
      return this.contents = this.compile ? contetents : "`" + contents + "`";
    }
  };

  JSFile.prototype._getModuleName = function() {
    var i, letter, letters, module, _len;
    module = path.relative(this.base, this.filepath).replace(path.extname(this.filename), '');
    if (this.RE_UPPERCASE.test(this.name)) {
      letters = this.name.split('');
      for (i = 0, _len = letters.length; i < _len; i++) {
        letter = letters[i];
        if (this.RE_UPPERCASE.test(letter)) {
          letters[i] = (i > 0 ? '_' : '') + letter.toLowerCase();
        }
      }
      module = module.replace(this.name, letters.join().replace(/,/g, ''));
    }
    return module;
  };

  JSFile.prototype._getModuleDependencies = function() {
    var dep, deps, match, part, parts, _i, _len, _ref;
    deps = [];
    while (match = this.RE_REQUIRE.exec(this.contents)) {
      dep = match[1];
      parts = dep.split('/');
      if (dep.charAt(0) === '.') {
        parts = this.name.split('/');
        parts.pop();
        _ref = dep.split('/');
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          part = _ref[_i];
          if (part === '..') {
            parts.pop();
          } else if (part !== '.') {
            parts.push(part);
          }
        }
      }
      deps.push(parts.join('/'));
    }
    return deps;
  };

  return JSFile;

})();

exports.CSSFile = CSSFile = (function() {

  __extends(CSSFile, File);

  CSSFile.prototype.RE_STYLUS_EXT = /\.styl$/;

  CSSFile.prototype.RE_LESS_EXT = /\.less$/;

  function CSSFile(filepath, base) {
    CSSFile.__super__.constructor.call(this, filepath, base);
    this.updateContents(fs.readFileSync(this.filepath, 'utf8'));
  }

  return CSSFile;

})();