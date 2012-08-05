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
    "targets":[],   // list of targets to which posts made from this site are sent, too
    "data":{}
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
    Request.Request(options).put();
  }
  else {
    Request.Request(options).get();
  }
}

// list of active page mods and workers
var page_mods = {};
var page_workers = {};

// function to connect callbacks to page workers and page mods - this provides the event-based interface between site backends and the main code
function connect_callbacks(worker, site_identifier) {
  var site_config = simpleStorage.storage.sites[site_identifier];

  worker.port.on("request-posts", function(posts, comments, start_date) {
    var feeds = site_config.feeds;

    Database.get_items(feeds, posts, comments, start_date, function(items) {
      worker.port.emit("transmit-posts", items);
    });
  });

  worker.port.on("request-comments", function(feed_id, post_id, max_comments) {
    Database.get_subitems(feed_id, post_id, max_comments, function(comments) {
      worker.port.emit("transmit-comments", comments);
    });
  });

  worker.port.on("send-item", function(item) {
    if (item.in_reply_to) { // comment: only to the origin
      var targets = [item.feed];
    }
    else { // top level posts: to every configured target
      var targets = site_config.targets;
    }

    Database.add_deliver(item, targets);
    deliver();
  });

  worker.port.on("set-data", function(data) {
    var stored_data = site_config.data;

    for (prop in data) { if (!data.hasOwnProperty(prop)) continue;
      var value = data[prop];
      if (value===null) {
        delete stored_data[prop];
      }
      else {
        stored_data[prop] = value;
      }
    }
  });

  worker.port.on("request-data", function() {
    var stored_data = site_config.data;

    worker.port.emit("transmit-data", stored_data);
  });

  worker.port.on("log", function(message, level) {
    console.log("LOG MESSAGE("+level+"): "+message);  // TODO: store messages and optionally submit to developer
  });

  worker.port.on("start-worker", function(config) {
    if (!page_workers[site_identifier]) page_workers[site_identifier] = [];

    var page_worker = create_page_worker(site_identifier, config);
    page_workers[site_identifier].push(page_worker);
  });

  worker.port.on("terminate", function() {
    worker.destroy();
  });
}

// function to create page mods
function create_page_mod(site_identifier, config) {
  var site_config = simpleStorage.storage.sites[site_identifier];

  var options = {};

  options.include = config.pattern;
/* for development */ options.include = "*";
  options.contentScriptWhen = config.when;

  options.contentScriptFile = [];
  for (var i=0; i<config.files.length; i++) {
    var path = "sites/"+site_identifier+"/"+config.files[i];
    var url = Self.data.url(path);
    options.contentScriptFile.push(url);
  }

  options.contentScriptOptions = site_config.data;

  options.onAttach = function(worker) {
    connect_callbacks(worker, site_identifier);

    var is_tab = (worker.tab != null);
    worker.port.emit("start", is_tab);
  };

  return pageMod.PageMod(options);
}

// function to create page workers
function create_page_worker(site_identifier, config) {
  var site_config = simpleStorage.storage.sites[site_identifier];

  var options = {};

  options.contentURL = config.url;
/* for development */ options.contentURL = "http://localhost/facebook/post.html";
  options.contentScriptWhen = config.when;

  options.contentScriptFile = [];
  for (var i=0; i<config.files.length; i++) {
    var path = "sites/"+site_identifier+"/"+config.files[i];
    var url = Self.data.url(path);
    options.contentScriptFile.push(url);
  }

  options.contentScriptOptions = site_config.data;

  var worker = pageWorker.Page(options);

  connect_callbacks(worker, site_identifier);

  var is_tab = false;
  worker.port.emit("start", is_tab);

  return worker;
}

// load configured page mods and workers
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

    if (!page_workers[site_identifier]) page_workers[site_identifier] = [];
    for (var i=0; i<config.page_workers.length; i++) {
      var page_worker = create_page_worker(site_identifier, config.page_workers[i]);
      page_workers[site_identifier].push(page_worker);
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

// delivery function
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
var feed_configuration = simpleStorage.storage.feeds[feed_identifier];
poll_feed(feed_identifier, feed_configuration);
