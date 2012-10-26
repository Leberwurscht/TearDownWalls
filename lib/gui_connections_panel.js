var Self = require("self");
var Panel = require("panel");
var simpleStorage = require("simple-storage");

var Sites = require("./sites");
var Polling = require("./polling");

var panel;

function connections_list() {
  // build list of connections, with lists of accounts appended
  var connections = [];
  for (var id=0; id<simpleStorage.storage.connections.next_id; id++) {
    var connection = simpleStorage.storage.connections[id];
    if (!connection) continue;

    var accounts = [];
    for (var j=0; j<Sites.sites.length; j++) {
      var site = Sites.sites[j];

      var configuration = simpleStorage.storage.accounts[site].configuration;
      for (identifier in configuration) { if (!configuration.hasOwnProperty(identifier)) continue;
        var account_configuration = configuration[identifier];

        accounts.push({
          avatar: account_configuration.avatar,
          name: account_configuration.name,
          site: site,
          identifier: identifier,
          enabled: (account_configuration.connections.indexOf(id) != -1)
        });
      }
    }

    connections.push({
      id: id,
      name: connection.name,
      accounts: accounts,
      export_json: JSON.stringify({
        name: connection.name,
        feed: connection.feed,
        target: connection.target,
        like_target: connection.like_target,
        poll_interval: connection.poll_interval
      }, null, "\t")
    });
  }

  return connections;
}

function run() {
  if (panel) panel.destroy();

  panel = Panel.Panel({
    width: 800,
    height: 600,
    contentURL: Self.data.url("connections.html"),
    contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("connections.js")]
  });

  panel.port.emit("set-connections", connections_list());

  panel.port.on("delete-connection", function(id) {
    // stop polling
    Polling.stop_job(id);

    // delete from connections list
    delete simpleStorage.storage.connections[id];

    // delete from accounts list
    for (var site in simpleStorage.storage.accounts) { if (!simpleStorage.storage.accounts.hasOwnProperty(site)) continue;
      var configuration = simpleStorage.storage.accounts[site].configuration;
      for (var account in configuration) { if (!configuration.hasOwnProperty(account)) continue;
        var connections = configuration[account].connections;
        var index = connections.indexOf(id);
        if (index != -1) connections.splice(index, 1);
      }
    }

    // update page mods
    Sites.update();
  });

  panel.port.on("set-account", function(connection, site, account, enabled) {
    var connections = simpleStorage.storage.accounts[site].configuration[account].connections;
    var index = connections.indexOf(connection);
    if (enabled) {
      if (index == -1) connections.push(connection);
    }
    else {
      if (index != -1) connections.splice(index, 1);
    }

    Sites.update();
  });

  panel.port.on("import", function(config) {
    panel.show();
    if (!config) return;

    // add connection
    var poll_interval = config.poll_interval;
    if (!poll_interval) poll_interval = 5*60*1000;

    var id = simpleStorage.storage.connections.next_id++;
    connection = {
      name: config.name,
      target: config.target,
      like_target: config.like_target,
      feed: config.feed,
      poll_interval: poll_interval
    };
    simpleStorage.storage.connections[id] = connection;

    // setup polling and page workers
    Polling.start_job(simpleStorage.storage.connections, id);
    Sites.update();

    // update list of connections
    panel.port.emit("set-connections", connections_list());
  });

  panel.show();
}

exports.run = run;
