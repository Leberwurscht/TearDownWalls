// load SDK built-in modules
var simpleStorage = require("simple-storage");
var pageMod = require("page-mod");
var Timers = require("timers");
var Request = require("request");
var pageWorker = require("page-worker");
var Self = require("self");

// load own modules
var Database = require("./database");

// list of supported sites, with match-patterns for the page mod
var match_patterns = {
  "facebook":"*.facebook.com"
};

// default settings
if (!simpleStorage.storage.sites) simpleStorage.storage.sites = {
  "facebook":{      // site identifer - to know which content script is to be used
    "feeds":[],     // list of feeds that should be injected into the stream on this site
    "targets":[],   // list of targets to which post made from this site are sent, too
  }
};

if (!simpleStorage.storage.feeds) simpleStorage.storage.feeds = {}; // properties of feeds: url, poll_interval, entries={id1:xml1, ...}
if (!simpleStorage.storage.targets) simpleStorage.storage.targets = {};

// for development
match_patterns["facebook"] = "*";
simpleStorage.storage.feeds = {"test":{ "url":"http://localhost/feed", "poll_interval":9999999999 }};
simpleStorage.storage.sites["facebook"].feeds = ["test"];

// list of active page mods
var page_mods = {};

// function to create page mods
function create_page_mod(site, feeds, targets) {
  return pageMod.PageMod({
    include: match_patterns[site],
    contentScriptWhen: 'end',
    contentScriptFile: [Self.data.url("jquery.js"), Self.data.url("site_"+site+".js")],
    onAttach: function(worker){
      console.log("connecting callbacks to worker for the "+site+" content script");

      worker.port.on("request-entries", function(toplevel_nr, comments_nr, start_date) {
        Database.get_items(feeds, 100, 2, start_date, function(items) {
          console.log("transmitting entries to "+site);
          worker.port.emit("transmit-entries", items);
        });
      });

      worker.port.on("send-post", function(text){
        // publish
        throw "Not implemented.";
      });
    }
  });
}

// load configured page mods
for (var site in simpleStorage.storage.sites) {
  var site_preferences = simpleStorage.storage.sites[site];
  var activate = (site_preferences.feeds.length || site_preferences.targets.length);

  if (activate) {
    page_mods[site] = create_page_mod(site, site_preferences.feeds, site_preferences.targets);
  }
}

// list of active jobs
var jobs = {};

// function to set up a feed poll job
function poll_feed(feed_identifier, feed_url) {
  console.log("Polling feed "+feed_identifier);

  // retrieve the xml
  Request.Request({
    url: feed_url,
    onComplete: function (response) { // and parse it with jQuery using a page worker
      console.log("Starting page worker to parse feed ("+response.text.length+" bytes)");

      var worker = pageWorker.Page({
        contentScriptWhen: 'end',
        contentScriptFile: [Self.data.url("jquery.js"), Self.data.url("parse_atom.js"), Self.data.url("html-css-sanitizer-minified.js")],
      });

      worker.port.on("transmit-entries", function(entries) {
        console.log("Saving parsed entries in database");

        Database.add_items(feed_identifier, entries);
      });

      worker.port.emit("request-entries", response.text);     // request parsed entries
    }
  }).get();
}

function create_poll_job(feed_identifier) {
  var feed = simpleStorage.storage.feeds[feed_identifier];

  return Timers.setInterval(function(){
    poll_feed(feed_identifier, feed.url);
  }, feed.poll_interval);
}

// set up jobs
for (feed_identifier in simpleStorage.storage.feeds) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// for development
require("tabs").open("http://localhost/facebook/post.html");
var feed_identifer = "test";
var feed = simpleStorage.storage.feeds["test"];
poll_feed(feed_identifier, feed.url);
