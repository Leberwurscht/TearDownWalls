var simpleStorage = require("simple-storage");

var Self = require("self");
var Panel = require("panel");
var Request = require("request");

var Sites = require("./sites");
var Polling = require("./polling");
var Database = require("./database");
var Lib = require("./lib");

var guiAccounts = require("./gui_accounts");

var guiAccountsPanel = require("./gui_accounts_panel");
var guiConnectionsPanel = require("./gui_connections_panel");
var guiExpertPanel = require("./gui_expert_panel");

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
        "name": response.json.teardownwalls_config.name,
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
    "name": target,
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

function setup_widget() {
  /* setup the TearDownWalls widget and the corresponding panel that is used to make connections */
  connect_panel = Panel.Panel({
    width: 400,
    height: 400,
    contentURL: Self.data.url("connect.html"),
    contentScriptFile: Lib.data_urls(["lib/jquery.js", "accounts.js", "connect.js"])
  });

  guiAccounts.setup_listeners(connect_panel);

  connect_panel.port.on("connect", function(account, connection) {
    if (!account) {
      require("notifications").notify({
        title: "Warning",
        text: "Discarding connection - no account selected"
      });
      return;
    }

    var configuration = simpleStorage.storage.accounts[account.site].configuration;
    if (!configuration[account.identifier]) configuration[account.identifier] = {connections: []};
    configuration[account.identifier].url = account.url;
    configuration[account.identifier].name = account.name;
    configuration[account.identifier].avatar = account.avatar;

    var account_data = simpleStorage.storage.accounts[account.site].account_data;
    if (!account_data[account.identifier]) account_data[account.identifier] = {};

    if (connection.type=="intro") {
      intro(connection.url, account.site, account.identifier, account.url, account.avatar, account.name);
    }
    else if (connection.type=="atom") {
      atom(connection.url, account.site, account.identifier);
    }
  });

  connect_panel.port.on("configure-accounts", guiAccountsPanel.run);
  connect_panel.port.on("configure-connections", guiConnectionsPanel.run);
  connect_panel.port.on("expert-mode", guiExpertPanel.run);

  var widget = require("widget").Widget({
    id: "teardownwalls-icon",
    label: "TearDownWalls",
    contentURL: Self.data.url("logo.png"),
    panel: connect_panel,
    onClick: function() {
      // enable/disable expert mode
      connect_panel.port.emit("set-expert", require("simple-prefs").prefs.expertMode);

      // get information
      var tab = require("tabs").activeTab;
      tab.attach({
        "contentScriptFile": [Self.data.url("lib/jquery.js"), Self.data.url("get_info.js")],
        "onMessage": function(list) {
          if (list.length>1) console.log("WARNING: more than one item returned by get_info"); // TODO

          // list accounts and display connection target
          connect_panel.port.emit("set-connection-target", list[0]);
          if (list[0]) guiAccounts.set_accounts(connect_panel, true);
        }
      });

    }
  });
}

exports.setup_widget = setup_widget;
