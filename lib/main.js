// load SDK built-in modules
var simpleStorage = require("simple-storage");
var pageMod = require("page-mod");
var Timers = require("timers");
var Request = require("request");
var pageWorker = require("page-worker");
var Self = require("self");

// load own modules
var Database = require("./database");

// load list of sites
var sites_json = Self.data.load("sites/index.json");
var sites = JSON.parse(sites_json);

// list of active page mods and workers
var page_mods = {};
var page_workers = {};

// default settings
if (!simpleStorage.storage.site_data) simpleStorage.storage.site_data = {};
if (!simpleStorage.storage.configurations) simpleStorage.storage.configurations = [];

for (var i=0; i<sites.length; i++) {
  var site = sites[i];
  if (!simpleStorage.storage.site_data[site]) {
    simpleStorage.storage.site_data[site] = {};
  }
  page_mods[site] = [];
  page_workers[site] = [];
}

// TODO: each time we load an item by id, we must specify the feed, as the feed owners could provoke collisions!

// for development
simpleStorage.storage.configurations.push({
  "feed": {
    "url": "http://localhost/feed",
    "method":"post",
  },
  "target":{
    "url":"http://friendica.mafiaspiel.org/light/post",
    "method":"post",
    "content": {
      "token": "***",
      "body":"{body}",
      "title":"{title}",
      "in_reply_to":"{in_reply_to}"
    }
  },
  "sites": ["facebook"],
  "poll_interval": 5*60*1000
});

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

// function to connect callbacks to page workers and page mods - this provides the event-based interface between site backends and the main code
function connect_callbacks(worker, site_identifier) {
  // for each feed/target pair, check if this site is activated and save the corresponding indices
  var indices = [];
  for (var i=0; i<simpleStorage.storage.configurations.length; i++) {
    var config = simpleStorage.storage.configurations[i];
    if (config.sites.indexOf(site_identifier) != -1) {
      indices.push(i);
    }
  }

  worker.port.on("request-posts", function(posts, comments, start_date) {
    // get items and send to content script
    Database.get_items(indices, posts, comments, start_date, function(items) {
      // add information if commenting is possible
      for (id in items) { if (!items.hasOwnProperty(id)) continue;
        var item = items[id];
        var configuration = simpleStorage.storage.configurations[item.feed];
        if (configuration.target) item.commenting_possible = true;
      }

      worker.port.emit("transmit-posts", items);
    });
  });

  worker.port.on("request-comments", function(feed_id, post_id, max_comments) {
    Database.get_subitems(feed_id, post_id, max_comments, function(comments) {
      worker.port.emit("transmit-comments", comments);
    });
  });

  worker.port.on("send-item", function(item) {
    if (item.targets) { // comment: only to the origin
      var targets = item.targets;
    }
    else { // top level posts: to every configured target
      var targets = indices;
    }

    Database.add_deliver(item, targets);
    deliver();
  });

  worker.port.on("set-data", function(data) {
    // get stored data
    var stored_data = simpleStorage.storage.site_data[site_identifier];

    // overwrite properties
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
    // get stored data
    var stored_data = simpleStorage.storage.site_data[site_identifier];

    worker.port.emit("transmit-data", stored_data);
  });

  worker.port.on("log", function(message, level) {
    var now = new Date();
    console.log(now.toISOString()+" "+site_identifier+"("+level+"): "+message);

    var date = Math.round(now.getTime() / 1000);
    Database.log(site_identifier, date, message, level);

    if (level>=0 && require("simple-prefs").prefs.helpDev) {
      Request.Request({
        url: "http://teardownwalls.mafiaspiel.org/log.php",
        content: {
          "site_identifier": site_identifier,
          "date": date,
          "message": message,
          "level": level,
        }
      }).post();

      console.log("sent log message to developer");
    }
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

  options.contentScriptOptions = {};

  var site_data = simpleStorage.storage.site_data[site_identifier];
  options.contentScriptOptions.data = site_data;

  options.contentScriptOptions.exposed = {};
  if (config.expose) {
    for (var i=0; i<config.expose.length; i++) {
      var file = config.expose[i];
      var path = "sites/"+site_identifier+"/"+file;
      var url = Self.data.url(path);
      options.contentScriptOptions.exposed[file] = url;
    }
  }

  options.onAttach = function(worker) {
    connect_callbacks(worker, site_identifier);

    var is_tab = (worker.tab != null);
    worker.port.emit("start", is_tab);
  };

  return pageMod.PageMod(options);
}

// function to create page workers
function create_page_worker(site_identifier, config) {
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

  options.contentScriptOptions = {};

  var site_data = simpleStorage.storage.site_data[site_identifier];
  options.contentScriptOptions.data = site_data;

  options.contentScriptOptions.exposed = {};
  if (config.expose) {
    for (var i=0; i<config.expose.length; i++) {
      var file = config.expose[i];
      var path = "sites/"+site_identifier+"/"+file;
      var url = Self.data.url(path);
      options.contentScriptOptions.exposed[file] = url;
    }
  }

  var worker = pageWorker.Page(options);

  connect_callbacks(worker, site_identifier);

  var is_tab = false;
  worker.port.emit("start", is_tab);

  return worker;
}

// load configured page mods and workers
active_sites = [];
for (var i=0; i<simpleStorage.storage.configurations.length; i++) {
  var active = simpleStorage.storage.configurations[i].sites;

  for (var j=0; j<active.length; j++) {
    if (active_sites.indexOf(active[j])==-1) {
      active_sites.push(active[j]);
    }
  }
}

for (var i=0; i<active_sites.length; i++) {
  var site_identifier = active_sites[i];
  var config_json = Self.data.load("sites/"+site_identifier+"/configuration.json");
  var config = JSON.parse(config_json);

  for (var j=0; j<config.page_mods.length; j++) {
    var page_mod = create_page_mod(site_identifier, config.page_mods[j]);
    page_mods[site_identifier].push(page_mod);
  }

  for (var j=0; j<config.page_workers.length; j++) {
    var page_worker = create_page_worker(site_identifier, config.page_workers[j]);
    page_workers[site_identifier].push(page_worker);
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
  var configuration = simpleStorage.storage.configurations[feed_identifier];
  if (!configuration || !configuration.feed) return;

  // first poll
  poll_feed(feed_identifier, configuration.feed);

  // configure job
  return Timers.setInterval(function(){
    poll_feed(feed_identifier, configuration.feed);
  }, configuration.poll_interval);
}

// set up jobs
for (var feed_identifier=0; feed_identifier<simpleStorage.storage.configurations.length; feed_identifier++) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// This function gets all queued items from the database and tries to deliver them.
function deliver() {
  Database.get_deliver(function(entries) { // TODO: give up after a certain number of attempts in a large enough range of time
    console.log("Trying to deliver "+entries.length+" items");

    for (var i=0; i<entries.length; i++) {
      var entry = entries[i];
      var target_identifier = entry.target;
      var config = simpleStorage.storage.configurations[target_identifier].target;
      if (!config) continue;

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

// subscribing mechanism
var subscribe = require("panel").Panel({
  width:215,
  height:160,
  contentURL: Self.data.url("subscribe.html"),
  contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("subscribe.js")],
});

require("widget").Widget({
  id: "teardownwalls-icon",
  label: "TearDownWalls",
  contentURL: Self.data.url("activated.png"),
  panel: subscribe,
  onClick: function() {
    var tab = require("tabs").activeTab;
    tab.attach({
      "contentScriptFile": [Self.data.url("lib/jquery.js"), Self.data.url("get_info.js")],
      "onMessage": function(list) {
        for (var i=0; i<list.length; i++) {
          var item = list[i];

          if (item.type=="atom") {
            var config = {
              "feed": {
                "url": item.url,
                "method": "get",
              },
              "target": null,
              "sites": ["facebook"],
              "poll_interval": 5*60*1000
            }
          }
          else if (item.type=="specification") {
            Request.Request({url: item.url}).get(function(response) {
              var specification = JSON.parse(response);
            });

            var config = {
              "feed": null,
              "target": null,
              "sites": ["facebook"],
              "poll_interval": 5*60*1000
            }

            config.feed = specification.feed;
            config.target = specification.target;
          }

          subscribe.port.on("submit", function(config) {
            simpleStorage.storage.configurations.push(config);
            create_poll_job(simpleStorage.storage.configurations.length-1);
            subscribe.hide();
            console.log("configuration added");
          });

          subscribe.port.emit("set-config", config);
        }
      }
    });
  }
});

// for development
require("tabs").open("http://localhost/facebook/post.html");
var feed_identifier = 0;
var feed_configuration = simpleStorage.storage.configurations[feed_identifier].feed;
if (feed_configuration) poll_feed(feed_identifier, feed_configuration);
