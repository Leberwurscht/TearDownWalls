/*
connect_callbacks: reacts to/sends events. needs database and configuration + delivery
create_page_worker: set options, exposed, crosspost_accounts
create_page_mod: +send start event
setup()
*/
var simpleStorage = require("simple-storage");
var Self = require("self");
var pageMod = require("page-mod");
var pageWorker = require("page-worker");

var Lib = require("./lib");
var Database = require("./database");
var Delivery = require("./delivery");

var addon_tabs = []; // tabs opened by this addon, no content scripts are appended to them

var page_mods = {};
var page_workers = {};

// load list of sites
var sites_json = Self.data.load("sites/index.json");
var sites = JSON.parse(sites_json);

// function to connect callbacks to page workers and page mods - this provides the event-based interface between site backends and the main code
function setup_worker(worker, site_identifier) {
  worker.port.on("request-posts", function(account, posts, comments, start_date) {
    var connections = simpleStorage.storage.accounts[site_identifier].configuration[account].connections;

    // get items and send to content script
    Database.get_items(connections, posts, comments, start_date, function(items) {
      // add information whether commenting is possible
      for (id in items) { if (!items.hasOwnProperty(id)) continue;
        var item = items[id];
        var connection = simpleStorage.storage.connections[item.feed];
        if (connection.target) item.commenting_possible = true;
      }

      worker.port.emit("transmit-posts", items);
    });
  });

  worker.port.on("request-comments", function(connection, post_id, max_comments) {
    Database.get_subitems(connection, post_id, max_comments, function(comments) {
      worker.port.emit("transmit-comments", comments);
    });
  });

  worker.port.on("send-item", function(account, item) {
    var connections;

    if (item.connections) { // comment: only to the origin
      connections = item.connections;
    }
    else { // top level posts: to every configured target
      connections = simpleStorage.storage.accounts[site_identifier].configuration[account].connections;
    }

    Database.add_deliver(item, connections);
    Delivery.deliver(simpleStorage.storage.connections);
  });

  worker.port.on("like-item", function(item_id, connections) {
    Database.add_deliver_like(item_id, connections);
    Delivery.deliver(simpleStorage.storage.connections);
  });

  worker.port.on("set-data", function(data, account) {
    // get stored data
    var stored_data;
    if (typeof account=="string") {
      stored_data = simpleStorage.storage.accounts[site_identifier].account_data[account];
    }
    else {
      stored_data = simpleStorage.storage.accounts[site_identifier].site_data;
    }

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

  worker.port.on("request-data", function(account) {
    // get stored data
    var stored_data;
    if (typeof account=="string") {
      stored_data = simpleStorage.storage.accounts[site_identifier].account_data[account];
    }
    else {
      stored_data = simpleStorage.storage.accounts[site_identifier].site_data;
    }

    worker.port.emit("transmit-data", stored_data, account);
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
          "level": level
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

  worker.port.emit("start");
}

function get_options(site_identifier, config) {
  var options = {};

  options.contentScriptWhen = config.when;

  options.contentScriptFile = Lib.data_urls(config.files, "sites/"+site_identifier);

  options.contentScriptOptions = {};

  var site_data = simpleStorage.storage.accounts[site_identifier].site_data;
  var account_data = simpleStorage.storage.accounts[site_identifier].account_data;
  options.contentScriptOptions.site_data = site_data;
  options.contentScriptOptions.account_data = account_data;

  options.contentScriptOptions.exposed = {};
  if (config.expose) {
    for (var i=0; i<config.expose.length; i++) {
      var file = config.expose[i];
      var path = "sites/"+site_identifier+"/"+file;
      var url = Self.data.url(path);
      options.contentScriptOptions.exposed[file] = url;
    }
  }

  var crosspost_accounts = [];
  var configuration = simpleStorage.storage.accounts[site_identifier].configuration;
  for (var account in configuration) { if (!configuration.hasOwnProperty(account)) continue;
    // go through configured connections and check if target is set
    var connections = configuration[account].connections;
    for (var i=0; i<connections.length; i++) {
      var id = connections[i];
      var connection = simpleStorage.storage.connections[id];
      if (connection && connection.target) {
        crosspost_accounts.push(account);
        break;
      }
    }
  }

  options.contentScriptOptions.crosspost_accounts = crosspost_accounts;

  return options;
}

// function to create page mods
function create_page_mod(site_identifier, config) {
  var options = get_options(site_identifier, config);

  options.include = config.pattern;

  options.onAttach = function(worker) {
    // no content script for login tab
    // + workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=777632
    var is_tab = !!worker.tab;
    var is_addon_tab = (addon_tabs.indexOf(worker.tab) != -1);
    if (!is_tab || is_addon_tab) {
      worker.destroy();
      return;
    }

    setup_worker(worker, site_identifier);
  };

  return pageMod.PageMod(options);
}

// function to create page workers
function create_page_worker(site_identifier, config) {
  var options = get_options(site_identifier, config);
  options.contentURL = config.url.replace("https://","http://"); // TODO: remove call to replace, was only for development

  var worker = pageWorker.Page(options);

  setup_worker(worker, site_identifier);

  return worker;
}

// load page mods and workers
function update(site_identifier) {
  if (!site_identifier) { // if no site given, update all sites
    for (var i=0; i<sites.length; i++) {
      var site_identifier = sites[i];
      update(site_identifier);
    }
  }
  else {
    if (!page_mods[site_identifier]) page_mods[site_identifier] = [];
    if (!page_workers[site_identifier]) page_workers[site_identifier] = [];

    // destroy all mods and workers
    for (var j=0; j<page_mods[site_identifier].length; j++) {
      var page_mod = page_mods[site_identifier][j];
      page_mod.destroy();
    }
    page_mods[site_identifier] = [];

    for (var j=0; j<page_mods[site_identifier].length; j++) {
      var page_worker = page_workers[site_identifier][j];
      page_workers.destroy();
    }
    page_workers[site_identifier] = [];

    // create new ones
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
}

exports.create_page_mod = create_page_mod;
exports.create_page_worker = create_page_worker;

exports.update = update;

exports.addon_tabs = addon_tabs;
exports.sites = sites;
