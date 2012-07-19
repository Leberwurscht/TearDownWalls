// load modules
var simpleStorage = require("simple-storage");
var pageMod = require("page-mod");
var Timers = require("timers");
var Request = require("request");
var pageWorker = require("page-worker");
var Self = require("self");

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
simpleStorage.storage.feeds = {"maxi":{ "url":"http://friendica.mafiaspiel.org/light/stream?token=bd09edf713143f2f875ec0069e4447bf46e499b8cb7400e599f4c6f17bfc1df8", "poll_interval":9999999999, "entries":{} }};
simpleStorage.storage.sites["facebook"].feeds = ["maxi"];

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

      worker.port.on("request-entries", function(toplevel_nr, comments_nr) {
        var entries = [];

        for (var i in simpleStorage.storage.sites[site].feeds) { // go through activated feeds for this site
          var feed_identifier = simpleStorage.storage.sites[site].feeds[i];
          var feed = simpleStorage.storage.feeds[feed_identifier];

          for (var entry in feed.entries) entries.push(feed.entries[entry]);  // add entries of this feed
        }

        worker.port.emit("transmit-entries", entries);
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
function poll_feed(feed) {
  console.log("Polling feed "+feed.url);

  // retrieve the xml
  Request.Request({
    url: feed.url,
    onComplete: function (response) { // and parse it with jQuery using a page worker
      console.log("Starting page worker to parse feed");
      console.log(response);

      var worker = pageWorker.Page({
        contentScriptWhen: 'end',
        contentScriptFile: [Self.data.url("jquery.js"), Self.data.url("parse_atom.js"), Self.data.url("html-css-sanitizer-minified.js")],
      });

      worker.port.on("transmit-entries", function(entries) {
        console.log("Saving parsed entries in simple storage");

        for (var entry_id in entries) {
          entry = entries[entry_id];

          if (entry) {
            feed.entries[entry_id] = entries[entry_id];
          }
          else {
            delete feed.entries[entry_id];
            console.log("Entry "+entry_id+" was deleted as requested by the feed "+feed.url);
          }
        }
      });

      worker.port.emit("request-entries", response.text);     // request parsed entries
    }
  }).get();
}

function create_poll_job(feed_identifier) {
  var feed = simpleStorage.storage.feeds[feed_identifier];

  return Timers.setInterval(function(){
    poll_feed(feed);
  }, feed.poll_interval);
}

// set up jobs
for (feed_identifier in simpleStorage.storage.feeds) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// for development
require("tabs").open("http://localhost/facebook/post.html");
poll_feed(simpleStorage.storage.feeds["maxi"]);
//
//pageMod.PageMod({
//    include: "*",
//    contentScriptWhen: 'end',
//    contentScriptFile: [self.data.url("jquery.js"), self.data.url("parse_atom.js")],
//    onAttach: function(worker){
//
//  worker.port.emit("request-entries");
//  worker.port.on("transmit-entries", function(entries) {
//console.log("got entries:");
//console.log(entries);
//    // save entries in simpleStorage
//    for (entry_id in entries) {
//      feed.entries[entry_id] = entries[entry_id];
//    }
//  });
//
//    }
//  });
//require("tabs").open("http://friendica.mafiaspiel.org/light/stream?token=bd09edf713143f2f875ec0069e4447bf46e499b8cb7400e599f4c6f17bfc1df8");

//  /////////
//  var data = require("self").data;
//  
//  // user interface(later):
//  
//  // list of input feeds, for each:
//  //  import them to [ ] facebook  [ ] only when logged in as ________
//  //                 [ ] twitter      [ ] only when logged in as ________
//  
//  // list of post apis, for each:
//  //  post to this api from [ ] facebook   '' ''
//  //                        [ ] twitter    '' ''
//  
//  // internal data representation:
//  
//  // list of network sites [=page mods], for each:
//  //  list of identifiers for input feeds + conditions
//  //  list of identifiers for post apis + conditions
//  
//  var pageMod = require("page-mod");
//  pageMod.PageMod({
//    include: "*", // for debugging
//    contentScriptWhen: 'end',
//    contentScriptFile: [data.url("jquery.js"), data.url("test.js")],
//    onAttach: function(worker){
//  
//  console.log("test callback being attached for worker:");
//  console.log(worker);
//      worker.port.on("request-posts", function(number_of_posts) {
//    console.log("BLAA3");
//    // ... get from storage ...
//    posts = [
//      {"title":"Titel 1", "body":"Bla bla bla 1"},
//      {"title":"Titel 2", "body":"Bla bla bla 2"},
//      {"title":"Titel 3", "body":"Bla bla bla 3"}
//    ];
//  
//    worker.port.emit("transmit-posts", posts);
//    worker.port.on("post", function(text){
//      // publish
//    });
//      });
//    }
//  });
//  
//  ////// for debugging
//  require("tabs").open("http://localhost/facebook/post.html");
//  
//  
//  
//  ///// to make friends
//  var connect = require("panel").Panel({
//    width: 300,
//    height: 200,
//    contentURL: data.url("connect.html"),
//    contentScriptFile: [data.url("jquery.js"), data.url("connect.js")]
//  });
//  require("widget").Widget({
//    label: "Connect",
//    id: "connect",
//    contentURL: "http://www.mozilla.org/favicon.ico",
//    panel: connect
//  });
//  connect.port.on("connect", function (url) {
//    // notify friend, send token
//    // keep checking if he accepts (perhaps while retrieving posts), notify user with a message if he does
//    // only send to him if he accepted, authenticate using token
//    
//    connect.hide();
//  });
