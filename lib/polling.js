var Lib = require("./lib");
var Database = require("./database");
var pageWorker = require("page-worker");

var Timers = require("timers");

// list of currently active poll jobs
var jobs = {};

// function to set up a feed poll job
function poll_feed(feed_identifier, feed_configuration) {
  console.log("Polling feed "+feed_identifier);

  variables = {};

  Lib.custom_request(feed_configuration, variables, function (response) { // parse response using a page worker
    console.log("Starting page worker to parse feed ("+response.text.length+" bytes)");

    var worker = pageWorker.Page({
      contentScriptWhen: 'end',
      contentScriptFile: Lib.data_urls(["parse_atom.js", "lib/html-css-sanitizer-minified.js"]),
      contentScriptOptions: feed_configuration
    });

    worker.port.on("transmit-entries", function(entries) {
      console.log("Saving parsed entries in database");

      Database.add_items(feed_identifier, entries);
    });

    worker.port.emit("request-entries", response.text);     // request parsed entries
  });
}

function start_job(connections_config, connection_nr) {
  if (connection_nr===undefined) { // if no connection nr given, (re)start all jobs
    stop_job();

    for (var connection_nr=0; connection_nr<connections_config.length; connection_nr++) {
      start_job(connections_config, connection_nr);
    }
  }
  else {
    // try to stop currently running job
    stop_job(connection_nr);

    // get configuration
    var configuration = connections_config[connection_nr];
    if (!configuration.feed) return;

    // first poll
    poll_feed(connection_nr, configuration.feed);

    // configure job
    var job = Timers.setInterval(poll_feed, configuration.poll_interval, connection_nr, configuration.feed);
    jobs[connection_nr] = job;
  }
}

function stop_job(connection_nr) {
  if (connection_nr===undefined) { // if no connection nr given, stop all jobs
    for (var connection_nr in jobs) { if (!jobs.hasOwnProperty(connection_nr)) continue;
      stop_job(connection_nr);
    }
  }
  else {
    // stop job if running
    var job = jobs[connection_nr];
    if (job) Timers.clearInterval(job);
  }
}

exports.start_job = start_job;
exports.stop_job = stop_job;
