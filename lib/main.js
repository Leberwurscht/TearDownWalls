// load SDK built-in modules
var simpleStorage = require("simple-storage");
var pageMod = require("page-mod");
var Timers = require("timers");
var Request = require("request");
var pageWorker = require("page-worker");
var Self = require("self");

// load own modules
var Database = require("./database");
var Lib = require("./lib");
var Polling = require("./polling");
var Delivery = require("./delivery");

// load list of sites
var sites_json = Self.data.load("sites/index.json");
var sites = JSON.parse(sites_json);

// list of active page mods and workers
var page_mods = {};
var page_workers = {};

/*
structure:
  - initialization
    * load site list
    * default settings
  - save/load in db/simpleStorage
  - GUI to set up connections
  - event-based interface to content scripts
  - database
  - polling
  - delivery
  - cleanup
  - lib
    * recursive_replace
    * data_urls
*/

var connect_panel;
var login_tab;

// default settings
if (!simpleStorage.storage.accounts) simpleStorage.storage.accounts = {};
if (!simpleStorage.storage.connections) simpleStorage.storage.connections = {next_id: 0};

for (var i=0; i<sites.length; i++) {
  var site = sites[i];
  if (!simpleStorage.storage.accounts[site]) {
    simpleStorage.storage.accounts[site] = {
      configuration: {},
      account_data: {},
      site_data: {}
    };
  }
  page_mods[site] = [];
  page_workers[site] = [];
}

// function to connect callbacks to page workers and page mods - this provides the event-based interface between site backends and the main code
function connect_callbacks(worker, site_identifier) {
  worker.port.on("request-posts", function(account, posts, comments, start_date) {
    var connections = simpleStorage.storage.accounts[site_identifier].configuration[account].connections;

    // get items and send to content script
    Database.get_items(connections, posts, comments, start_date, function(items) {
      // add information if commenting is possible
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
}

// function to create page mods
function create_page_mod(site_identifier, config) {
  var options = {};

  options.include = config.pattern;
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
      if (connection.target) {
        crosspost_accounts.push(account);
        break;
      }
    }
  }
  options.contentScriptOptions.crosspost_accounts = crosspost_accounts;

  options.onAttach = function(worker) {
    // no content script for login tab
    if (worker.tab==login_tab) return;

    connect_callbacks(worker, site_identifier);

    // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=777632
    var is_tab = (worker.tab != null);
    if (is_tab) {
      worker.port.emit("start");
    }
    else {
      worker.destroy();
    }
  };

  return pageMod.PageMod(options);
}

// function to create page workers
function create_page_worker(site_identifier, config) {
  var options = {};

  options.contentURL = config.url;
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

  var worker = pageWorker.Page(options);

  connect_callbacks(worker, site_identifier);

  worker.port.emit("start");
  return worker;
}

// load page mods and workers
function update_mods_and_workers() {
  for (var i=0; i<sites.length; i++) {
    var site_identifier = sites[i];
    var config_json = Self.data.load("sites/"+site_identifier+"/configuration.json");
    var config = JSON.parse(config_json);

    // destroy
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

    // create
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
update_mods_and_workers();

// connection mechanism
connect_panel = require("panel").Panel({
  width: 400,
  height: 400,
  contentURL: Self.data.url("connect.html"),
  contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("accounts.js"), Self.data.url("connect.js")]
});

function intro(target, site, identifier, url, avatar, name) {
  // make request
  Request.Request({
    url: target,
    content: {
      url: url,
      name: name,
      avatar: avatar
    },
    onComplete: function(response) {
      // check if successful and print error messages
      if (response.json.error) {
        require("notifications").notify({
          title: response.json.successful ? "Warning" : "Error",
          text: response.json.error
        });
      }
      if (!response.json.successful) return;

      // save configuration
      var id = simpleStorage.storage.connections.next_id++;
      simpleStorage.storage.connections[id] = {
        "feed": response.json.teardownwalls_config.feed,
        "target": response.json.teardownwalls_config.target,
        "poll_interval": 5*60*1000
      };
      simpleStorage.storage.accounts[site].configuration[identifier].connections.push(id);

      // setup polling
      Polling.start_job(simpleStorage.storage.connections, id);

      // success message
      require("notifications").notify({
        title: "Introduction sent."
      });

      update_mods_and_workers();
      connect_panel.hide();
    }
  }).get();
}

function atom(target, site, identifier) {
  var id = simpleStorage.storage.connections.next_id++;
  simpleStorage.storage.connections[id] = {
    "feed": {
      "url": target,
      "method": "get"
    },
    "poll_interval": 5*60*1000
  };
  simpleStorage.storage.accounts[site].configuration[identifier].connections.push(id);

  // setup polling
  Polling.start_job(simpleStorage.storage.connections, id);

  // success message
  require("notifications").notify({
    title: "Added feed."
  });

  update_mods_and_workers();
  connect_panel.hide();
}

connect_panel.port.on("account-selected", function(type, target, site, identifier, url, avatar, name) {
  if (!identifier) {
    require("notifications").notify({
      title: "Warning",
      text: "Discarding connection - no account selected"
    });
    return;
  }

  var configuration = simpleStorage.storage.accounts[site].configuration;
  if (!configuration[identifier]) configuration[identifier] = {connections: []};
  configuration[identifier].name = name;
  configuration[identifier].avatar = avatar;

  var account_data = simpleStorage.storage.accounts[site].account_data;
  if (!account_data[identifier]) account_data[identifier] = {};

  if (type=="intro") {
    intro(target, site, identifier, url, avatar, name);
  }
  else if (type=="atom") {
    atom(target, site, identifier);
  }
});

connect_panel.port.on("request-login", function(site) {
  if (sites.indexOf(site)==-1) return;

  var config_json = Self.data.load("sites/"+site+"/configuration.json");
  var config = JSON.parse(config_json);

  login_tab = null;
  var times_attached = 0;

  var windows = require("windows").browserWindows;
  var win = windows.open({
    url: config.relogin.url.replace("https://","http://"), // TODO: remove call to replace, was only for development
    onOpen: function(win) {
      var tab = win.tabs[0];
      login_tab = tab;

      tab.on("ready", function() {
        var site_data = simpleStorage.storage.accounts[site].site_data;
        var account_data = simpleStorage.storage.accounts[site].account_data;
        var worker = tab.attach({
          contentScriptWhen: config.relogin.when,
          contentScriptFile: Lib.data_urls(config.relogin.files, "sites/"+site),
          contentScriptOptions: {
            site_data: site_data,
            account_data: account_data
          }
        });

        worker.port.on("logged-in", function(identifier, url, avatar, name) {
          tab.close();
          connect_panel.show(); // TODO: why necessary?

          connect_panel.port.emit("currently-logged-in", site, {
            identifier: identifier, // TODO: use
            url: url,
            avatar: avatar,
            name: name
          });
        });

        if (times_attached==0) {
          worker.port.emit("log-out");
        }
        else if (times_attached==1) {
          worker.port.emit("redirect");
          worker.port.emit("get-user");
        }
        else {
          worker.port.emit("get-user");
        }
        times_attached++;
      });
    }
  });
});

require("widget").Widget({
  id: "teardownwalls-icon",
  label: "TearDownWalls",
  contentURL: Self.data.url("logo.png"),
  panel: connect_panel,
  onClick: function() {
    // get information
    var tab = require("tabs").activeTab;
    tab.attach({
      "contentScriptFile": [Self.data.url("lib/jquery.js"), Self.data.url("get_info.js")],
      "onMessage": function(list) {
        if (list.length>1) console.log("WARNING: more than one item returned by get_info"); // TODO

        var type, url, title;
        if (list.length) {
          type = list[0].type;
          url = list[0].url;
          title = list[0].title;
        }

        // list sites
        site_list = [];
        for (var i=0; i<sites.length; i++) {
          var site = sites[i];
          var item = {};
          item.name = site;
          item.accounts = [];

          var configuration = simpleStorage.storage.accounts[site].configuration;
          for (account in configuration) { if (!configuration.hasOwnProperty(account)) continue;
            name = configuration[account].name;
            avatar = configuration[account].avatar;
            item.accounts.push({
              url: url,
              avatar: avatar,
              name: name
            });
          }

          site_list.push(item);
        }
        connect_panel.port.emit("query-account", type, url, title, site_list);

        // try to get currently logged in users
        for (var i=0; i<sites.length; i++) {
          var site = sites[i];
          var config_json = Self.data.load("sites/"+site+"/configuration.json");
          var config = JSON.parse(config_json).get_user;

          var site_data = simpleStorage.storage.accounts[site].site_data;
          var account_data = simpleStorage.storage.accounts[site].account_data;
          var worker = pageWorker.Page({
            contentURL: config.url.replace("https://","http://"), // TODO: remove call to replace, was only for development
            contentScriptWhen: config.when,
            contentScriptFile: Lib.data_urls(config.files, "sites/"+site),
            contentScriptOptions: {
              site_data: site_data,
              account_data: account_data
            }
          });

          connect_callbacks(worker, site);

          worker.port.on("logged-in", function(identifier, url, avatar, name) {
            connect_panel.port.emit("currently-logged-in", site, {
              identifier: identifier,
              url: url,
              avatar: avatar,
              name: name
            });
          });

          worker.port.emit("get-user");
        }
      }
    });

  }
});
