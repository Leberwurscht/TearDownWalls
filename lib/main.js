// load SDK built-in modules
var simpleStorage = require("simple-storage");
var pageMod = require("page-mod");
var Timers = require("timers");
var Request = require("request");
var pageWorker = require("page-worker");
var Self = require("self");

// load own modules
var Database = require("./database");

// default settings
if (!simpleStorage.storage.sites) simpleStorage.storage.sites = {
  "facebook":{      // site identifer - to know which content script is to be used
    "feeds":[],     // list of feeds that should be injected into the stream on this site
    "targets":[],   // list of targets to which post made from this site are sent, too
  }
};

if (!simpleStorage.storage.feeds) simpleStorage.storage.feeds = {}; // properties of feeds: url, poll_interval, entries={id1:xml1, ...}
if (!simpleStorage.storage.targets) simpleStorage.storage.targets = {};

// for development
match_patterns["facebook"] = "*";
simpleStorage.storage.feeds = {"test":{ "url":"http://localhost/feed", "poll_interval":9999999999 }};
simpleStorage.storage.sites["facebook"].feeds = ["test"];

function replace_variables(target, variables) {
  if (typeof target=="object") {
    var r = {};

    for (prop in target) { if (!target.hasOwnProperty(prop)) continue;
      r[prop] = replace_variables(target[prop], variables);
    }

    return r;
  }
  else if (typeof target=="string") {
    var r = target.replace(/{(.*?)}/gm, function(match, variable_name) {
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

function make_request(configuration, variables, handler) {
  var options = {}

  options.url = replace_variables(configuration.url, variables)
  options.headers = replace_variables(configuration.headers, variables)
  options.content = replace_variables(configuration.content, variables)
  options.contentType = replace_variables(configuration.contentType, variables)
  options.overrideMimeType = replace_variables(configuration.overrideMimeType, variables)

  options.onComplete = handler;

  if (configuration.method=="post") {
    Request.Request(options).post();
  }
  else if (configuration.method=="put") {
    Request.Request(options).post();
  }
  else {
    Request.Request(options).get();
  }
}

// list of active page mods
var page_mods = {};

// function to connect callbacks to page workers and page mods
function connect_callbacks(worker, site_identifier) {
  worker.port.on("request-posts", function(posts, comments, start_date) {
    var feeds = simpleStorage.storage.sites[site_identifier].feeds;

    Database.get_items(feeds, posts, comments, start_date, function(items) {
      worker.port.emit("transmit-posts", items);
    });
  });

  worker.port.on("request-comments", function(feed_id, item_id, max_comments) {
    Database.get_subitems(feed_id, item_id, max_comments, function(comments) {
      worker.port.emit("transmit-comments", comments);
    });
  });

  worker.port.on("send-item", function(item) {
    var targets = simpleStorage.storage.sites[site_identifier].targets;

    Database.add_deliver(targets, item);
    deliver();
  });

  worker.port.on("set-data", function(data) {
    throw "Not implemented";
  });

  worker.port.on("request-data", function() {
    throw "Not implemented";
  });

  worker.port.on("log", function(message, level) {
    throw "Not implemented";
  });

  worker.port.on("start-worker", function(config) {
    throw "Not implemented";
  });
}

// function to create page mods
function create_page_mod(site_identifier, config) {
  var options = {};

  options.include = config.pattern;
/* for debugging */ options.include = "*";
  options.contentScriptWhen = config.when;

  options.contentScriptFile = [];
  for (var i=0; i<config.files.length; i++) {
    var path = "sites/"+site_identifier+"/"+config.files[i];
    var url = Self.data.url(path);
    options.contentScriptFile.push(url);
  }

console.log(JSON.stringify(options));
  options.onAttach = function (worker) {
    connect_callbacks(worker, site_identifier);
  };

  return pageMod.PageMod(options);
}

// load configured page mods
for (var site_identifier in simpleStorage.storage.sites) { if (!simpleStorage.storage.sites.hasOwnProperty(site_identifier)) continue;
  var site_preferences = simpleStorage.storage.sites[site_identifier];
  var activate = (site_preferences.feeds.length || site_preferences.targets.length);

  if (activate) {
    var config_json = Self.data.load("sites/"+site_identifier+"/configuration.json");
    var config = JSON.parse(config_json);

    if (!page_mods[site_identifier]) page_mods[site_identifier] = [];
    for (var i=0; i<config.page_mods.length; i++) {
      var page_mod = create_page_mod(site_identifier, config.page_mods[i]);
      page_mods[site_identifier].push(page_mod);
    }
  }
}

// list of active jobs
var jobs = {};

// function to set up a feed poll job
function poll_feed(feed_identifier, feed_configuration) {
  console.log("Polling feed "+feed_identifier);

  variables = {};

  make_request(feed_configuration, variables, function (response) { // parse response with jQuery using a page worker
    console.log("Starting page worker to parse feed ("+response.text.length+" bytes)");

    var worker = pageWorker.Page({
      contentScriptWhen: 'end',
      contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("parse_atom.js"), Self.data.url("lib/html-css-sanitizer-minified.js")],
    });

    worker.port.on("transmit-entries", function(entries) {
      console.log("Saving parsed entries in database");

      Database.add_items(feed_identifier, entries);
    });

    worker.port.emit("request-entries", response.text);     // request parsed entries
  });
}

function create_poll_job(feed_identifier) {
  var feed_configuration = simpleStorage.storage.feeds[feed_identifier];

  return Timers.setInterval(function(){
    poll_feed(feed_identifier, feed_configuration);
  }, feed_configuration.poll_interval);
}

// set up jobs
for (feed_identifier in simpleStorage.storage.feeds) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// send post function
function deliver() {
  Database.get_deliver(function(entries) {
    console.log("Trying to deliver "+entries.length+" items");

    for (var i=0; i<entries.length; i++) {
      var entry = entries[i];
      var target_identifier = entry.target;
      var config = simpleStorage.storage.targets[target_identifier];

      var variables = {
        "title": entry.title ? entry.title : '',
        "body": entry.content ? entry.content : '',
        "in_reply_to": entry.in_reply_to ? entry.in_reply_to : ''
      };

      make_request(config, variables, function(response) {
        if (200<=response.status && response.status<300) {
          var successful = true;
        }
        else {
          var successful = false;
        }

        Database.register_delivery_attempt(entry.id, successful);
      });
    }
  });
}

// for development
require("tabs").open("http://localhost/facebook/post.html");
var feed_identifer = "test";
var feed_configuration = simpleStorage.storage.feeds["test"];
poll_feed(feed_identifier, feed_configuration);
