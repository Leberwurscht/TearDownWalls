// load SDK built-in modules
var simpleStorage = require("simple-storage");

// load own modules
var Database = require("./database");
var Lib = require("./lib");
var Polling = require("./polling");
var Delivery = require("./delivery");
var Cleanup = require("./cleanup");
var Settings = require("./settings");
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
Settings.setup();

// initially set up mods and workers
Sites.update();

// setup widget
Gui.setup_widget();

// start cleanup job
Cleanup.run();
