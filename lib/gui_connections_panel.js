var Self = require("self");
var Panel = require("panel");
var simpleStorage = require("simple-storage");

var Sites = require("./sites");

var panel;

function run() {
  if (panel) panel.destroy();

  panel = Panel.Panel({
    width: 800,
    height: 600,
    contentURL: Self.data.url("connections.html"),
    contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("connections.js")]
  });

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
      accounts: accounts
    });
  }
  panel.port.emit("set-connections", connections);

  panel.port.on("delete-connection", function(id) {
    delete simpleStorage.storage.connections[id];
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
  });
  panel.port.on("export", function(id) {
    console.log("TODO: export "+id);
  });
  panel.port.on("import", function() {
    console.log("TODO: import");
  });

  panel.show();
}

exports.run = run;
