var Self = require("self");
var Request = require("request");

// function to call data.url on arrays
function data_urls(files, base_path) {
  if (!base_path) base_path = ".";

  var urls = [];
  for (var i=0; i<files.length; i++) {
    var path = files[i];
    if (base_path) path = base_path+"/"+path;

    var url = Self.data.url(path);
    urls.push(url);
  }

  return urls;
}

function recursive_replace(target, variables) {
  var r;

  if (typeof target=="object") {
    r = {};

    for (prop in target) { if (!target.hasOwnProperty(prop)) continue;
      r[prop] = recursive_replace(target[prop], variables);
    }

    return r;
  }
  else if (typeof target=="string") {
    r = target.replace(/{(.*?)}/gm, function(match, variable_name) {
      if (variable_name=="brace_open") {
        return "{";
      }
      else if (variable_name=="brace_close") {
        return "}";
      }
      else {
        return variables[variable_name];
      }
    });

    return r;
  }
  else if (target===undefined) {
    return undefined;
  }
  else {
    throw "Invalid type of target argument";
  }
}

function custom_request(configuration, variables, handler) {
  var options = {};

  options.url = recursive_replace(configuration.url, variables);
  options.headers = recursive_replace(configuration.headers, variables);
  options.content = recursive_replace(configuration.content, variables);
  options.contentType = recursive_replace(configuration.contentType, variables);
  options.overrideMimeType = recursive_replace(configuration.overrideMimeType, variables);

  options.onComplete = handler;

  if (configuration.method=="post") {
    Request.Request(options).post();
  }
  else if (configuration.method=="put") {
    Request.Request(options).put();
  }
  else {
    Request.Request(options).get();
  }
}

exports.data_urls = data_urls;
exports.custom_request = custom_request;
