var simpleStorage = require("simple-storage");

var Self = require("self");
var Panel = require("panel");
var Request = require("request");

var Sites = require("./sites");
var Polling = require("./polling");
var Lib = require("./lib");

var connect_panel;

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
        "poll_interval": .5*60*1000
      };
      simpleStorage.storage.accounts[site].configuration[identifier].connections.push(id);

      // setup polling
      Polling.start_job(simpleStorage.storage.connections, id);

      // success message
      require("notifications").notify({
        title: "Introduction sent."
      });

      Sites.update(site);
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

  Sites.update(site);
  connect_panel.hide();
}

function setup() {
  // connection mechanism
  connect_panel = Panel.Panel({
    width: 400,
    height: 400,
    contentURL: Self.data.url("connect.html"),
    contentScriptFile: Lib.data_urls(["lib/jquery.js", "accounts.js", "connect.js"])
  });

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
    if (Sites.sites.indexOf(site)==-1) return;

    var config_json = Self.data.load("sites/"+site+"/configuration.json");
    var config = JSON.parse(config_json);

    Sites.login_tab = null;
    var times_attached = 0;

    var windows = require("windows").browserWindows;
    var win = windows.open({
      url: config.relogin.url.replace("https://","http://"), // TODO: remove call to replace, was only for development
      onOpen: function(win) {
        var tab = win.tabs[0];
        Sites.login_tab = tab;

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

  var widget = require("widget").Widget({
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
          for (var i=0; i<Sites.sites.length; i++) {
            var site = Sites.sites[i];
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
          for (var i=0; i<Sites.sites.length; i++) {
            var site = Sites.sites[i];

            var config_json = Self.data.load("sites/"+site+"/configuration.json");
            var config = JSON.parse(config_json).get_user;

            var worker = Sites.create_page_worker(site, config);

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
}

exports.setup = setup;
