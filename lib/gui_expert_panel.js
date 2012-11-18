var Self = require("self");
var Panel = require("panel");
var simpleStorage = require("simple-storage");

var Sites = require("./sites");
var Database = require("./database");
var Polling = require("./polling");

function run() {
  var delivery_queue = Database.get_deliver();

  var expert_panel = Panel.Panel({
    width: 800,
    height: 600,
    contentURL: Self.data.url("expert.html"),
    contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("expert.js")],
    contentScriptOptions: {
      "configuration": JSON.stringify(simpleStorage.storage, null, "\t"),
    }
  });

  expert_panel.on("hide", function() {
    expert_panel.destroy();
  });

  Database.get_log(function(log) {
    expert_panel.port.emit("set-log", log);
  });

  Database.get_deliver(function(queue) {
    var queue_sizes = [];
    for (var i=0; i<simpleStorage.storage.connections.next_id; i++) {
      queue_sizes.push(0);
    }

    for (var i=0; i<queue.length; i++) {
      queue_sizes[parseInt(queue[i].target)]++;
    }

    expert_panel.port.emit("set-queue", queue_sizes);
  });

  Database.get_deliver_like(function(queue) {
    var queue_sizes = [];
    for (var i=0; i<simpleStorage.storage.connections.next_id; i++) {
      queue_sizes.push(0);
    }

    for (var i=0; i<queue.length; i++) {
      queue_sizes[parseInt(queue[i].target)]++;
    }

    expert_panel.port.emit("set-queue-like", queue_sizes);
  });

  expert_panel.port.on("set-configuration", function(config_json) {
    var config = JSON.parse(config_json);

    // overwrite configuration
    for (var key in config) { if (!config.hasOwnProperty(key)) continue;
      simpleStorage.storage[key] = config[key];
    }

    // remove deleted keys
    for (var key in simpleStorage.storage) { if (!simpleStorage.storage.hasOwnProperty(key)) continue;
      if (!config.hasOwnProperty(key)) {
        delete simpleStorage.storage[key];
      }
    }
    Sites.update();
    Polling.start_job(simpleStorage.storage.connections);
  });

  expert_panel.show();
}

exports.run = run;
