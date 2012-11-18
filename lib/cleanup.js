var Timers = require("timers");
var simpleStorage = require("simple-storage");

var Database = require("./database");

var interval = 7*24*3600*1000; // seven days

function cleanup() {
  var now = new Date().getTime();
  if ( simpleStorage.storage.last_cleanup > now - interval ) return;

  Database.cleanup();
  simpleStorage.storage.last_cleanup = now;
}

function run() {
  Timers.setInterval(cleanup, interval);
  cleanup();
}

exports.run = run;
