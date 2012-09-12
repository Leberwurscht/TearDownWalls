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

/*
structure:
  - initialization
  - save/load in db/simpleStorage
  - GUI to set up connection
  - event-based interface to content scripts
  - database
  - polling
  - delivery
  - cleanup
*/

var connect_panel;
var logout_sent;
var login_tab;
var logged_in_callback;

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

function replace_variables(target, variables) {
  var r;

  if (typeof target=="object") {
    r = {};

    for (prop in target) { if (!target.hasOwnProperty(prop)) continue;
      r[prop] = replace_variables(target[prop], variables);
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

function make_request(configuration, variables, handler) {
  var options = {};

  options.url = replace_variables(configuration.url, variables);
  options.headers = replace_variables(configuration.headers, variables);
  options.content = replace_variables(configuration.content, variables);
  options.contentType = replace_variables(configuration.contentType, variables);
  options.overrideMimeType = replace_variables(configuration.overrideMimeType, variables);

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
    deliver();
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

// function to call data.url on arrays
function map_urls(files, base_path) {
  var urls = [];

  for (var i=0; i<files.length; i++) {
    var path = files[i];
    if (base_path) path = base_path+"/"+path;

    var url = Self.data.url(path);
    urls.push(url);
  }

  return urls;
}

// function to create page mods
function create_page_mod(site_identifier, config) {
  var options = {};

  options.include = config.pattern;
  options.contentScriptWhen = config.when;

  options.contentScriptFile = map_urls(config.files, "sites/"+site_identifier);

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
    connect_callbacks(worker, site_identifier);

    if (login_tab && worker.tab==login_tab) {
      if (!logout_sent) {
        worker.port.emit("log-out");
        logout_sent = true;
      }
      else {
        worker.port.on("logged-in", function(identifier, url, avatar, name) {
          worker.tab.close();
          connect_panel.show();
          var callback = logged_in_callback;
          login_tab = null;
          logout_sent = false;
          logged_in_callback = null;

          callback(identifier, url, avatar, name);
        });
      }
      return;
    }

    var is_tab = (worker.tab != null);
    worker.port.emit("start", is_tab);
  };

  return pageMod.PageMod(options);
}

// function to create page workers
function create_page_worker(site_identifier, config) {
  var options = {};

  options.contentURL = config.url;
  options.contentScriptWhen = config.when;

  options.contentScriptFile = map_urls(config.files, "sites/"+site_identifier);

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

  var is_tab = false;
  worker.port.emit("start", is_tab);

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

// list of active jobs
var jobs = {};

// function to set up a feed poll job
function poll_feed(feed_identifier, feed_configuration) {
  console.log("Polling feed "+feed_identifier);

  variables = {};

  make_request(feed_configuration, variables, function (response) { // parse response using a page worker
    console.log("Starting page worker to parse feed ("+response.text.length+" bytes)");

    var worker = pageWorker.Page({
      contentScriptWhen: 'end',
      contentScriptFile: [Self.data.url("parse_atom.js"), Self.data.url("lib/html-css-sanitizer-minified.js")],
      contentScriptOptions: feed_configuration
    });

    worker.port.on("transmit-entries", function(entries) {
      console.log("Saving parsed entries in database");

      Database.add_items(feed_identifier, entries);
    });

    worker.port.emit("request-entries", response.text);     // request parsed entries
  });
}

function create_poll_job(connection) {
  var configuration = simpleStorage.storage.connections[connection];
  if (!configuration || !configuration.feed) return;

  // first poll
  poll_feed(connection, configuration.feed);

  // configure job
  return Timers.setInterval(function(){
    poll_feed(connection, configuration.feed);
  }, configuration.poll_interval);
}

// set up jobs
for (var feed_identifier=0; feed_identifier<simpleStorage.storage.connections.length; feed_identifier++) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// This function gets all queued items from the database and tries to deliver them.
function deliver() {
  Database.get_deliver(function(entries) { // TODO: give up after a certain number of attempts in a large enough range of time
    console.log("Trying to deliver "+entries.length+" items");

    for (var i=0; i<entries.length; i++) {
      var entry = entries[i];
      var connection = entry.target;
      var config = simpleStorage.storage.connections[connection].target;
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
      create_poll_job(id);

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
  create_poll_job(id);

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
  logout_sent = false;
  logged_in_callback = null;

  var windows = require("windows").browserWindows;
  var win = windows.open({
    url: config.login_url.replace("https://","http://"), // TODO: remove call to replace, was only for development
    onOpen: function(win) {
      var tab = win.tabs[0];
      login_tab = tab;
      logged_in_callback = function(identifier, url, avatar, name) {
        connect_panel.port.emit("currently-logged-in", site, {
          identifier: identifier, // TODO: use
          url: url,
          avatar: avatar,
          name: name
        });
      }
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
          var config = JSON.parse(config_json).get_logged_in_user;

          var worker = pageWorker.Page({
            contentURL: config.url.replace("https://","http://"), // TODO: remove call to replace, was only for development
            contentScriptWhen: config.when,
            contentScriptFile: map_urls(config.files, "sites/"+site)
          });

          worker.port.on("logged-in", function(identifier, url, avatar, name) {
            connect_panel.port.emit("currently-logged-in", site, {
              identifier: identifier,
              url: url,
              avatar: avatar,
              name: name
            });
          });
        }
      }
    });

  }
});
