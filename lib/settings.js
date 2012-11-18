var simpleStorage = require("simple-storage");

var Sites = require("./sites");

function setup() {
  // default settings
  if (!simpleStorage.storage.accounts) simpleStorage.storage.accounts = {};
  if (!simpleStorage.storage.connections) simpleStorage.storage.connections = {next_id: 0};

  for (var i=0; i<Sites.sites.length; i++) {
    var site = Sites.sites[i];
    if (!simpleStorage.storage.accounts[site]) {
      simpleStorage.storage.accounts[site] = {
        configuration: {},
        account_data: {},
        site_data: {}
      };
    }
  }
}

exports.setup = setup;
