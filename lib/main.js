// load SDK built-in modules
var simpleStorage = require("simple-storage");

// load own modules
var Database = require("./database");
var Lib = require("./lib");
var Polling = require("./polling");
var Delivery = require("./delivery");
var Cleanup = require("./cleanup");
var Sites = require("./sites");
var Gui = require("./gui");

/*
structure:
  - initialization
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

// initially set up mods and workers
Sites.update();

// setup widget
Gui.setup_widget();

// start cleanup job
Cleanup.run();
