// Generated by CoffeeScript 1.4.0

exports.extend = function(obj, options) {
  var option, value;
  for (option in options) {
    value = options[option];
    obj[option] = value;
  }
  return obj;
};

exports.clone = function(obj) {
  var o, prop, value;
  o = {};
  for (prop in obj) {
    value = obj[prop];
    o[prop] = value;
  }
  return o;
};