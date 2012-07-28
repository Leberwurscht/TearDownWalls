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

function replace_variables(target, patterns, variables) {
  if (!patterns) return target;

  if (typeof target=="object") {
    var r = {};

    for (prop in target) { if (!target.hasOwnProperty(prop)) continue;
      r[prop] = replace_variables(target[prop], patterns, variables);
    }

    return r;
  }
  else if (typeof target=="string") {
    var r = target;

    for (var i=0; i<patterns.length; i++) {
      var pattern = patterns[i][0];
      var variable_name = patterns[i][1];
      var variable_value = variables[variable_name];
      r = r.replace(new RegExp(pattern,"gm"), variable_value);
    }
    return r;
  }
  else if (target===undefined) {
    return undefined;
  }
  else {
    throw "Invalid type of target argument";
  }
}

function make_request(configuration, variables, handler) {
  var options = {}

  options.url = replace_variables(configuration.url, configuration.patterns, variables)
  options.headers = replace_variables(configuration.headers, configuration.patterns, variables)
  options.content = replace_variables(configuration.content, configuration.patterns, variables)
  options.contentType = replace_variables(configuration.contentType, configuration.patterns, variables)
  options.overrideMimeType = replace_variables(configuration.overrideMimeType, configuration.patterns, variables)

  options.onComplete = handler;

  if (configuration.method=="post") {
    Request.Request(options).post();
  }
  else if (configuration.method=="put") {
    Request.Request(options).post();
  }
  else {
    Request.Request(options).get();
  }
}

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
        Database.get_items(feeds, toplevel_nr, comments_nr, start_date, function(items) {
          console.log("transmitting entries to "+site+" starting from timestamp "+start_date);
          worker.port.emit("transmit-entries", items);
        });
      });

      worker.port.on("request-comments", function(feed, id, max_comments) {
        console.log("request comments for feed "+feed+", item "+id); // TODO

        Database.get_subitems(feed, id, max_comments, function(comments) {
          worker.port.emit("transmit-comments", comments);
        });
      });

      worker.port.on("send-post", function(entry){
        // TODO: publish
        console.log(JSON.stringify(entry));
        send_post(targets, entry);
//        throw "Not implemented.";
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
function poll_feed(feed_identifier, feed_configuration) {
  console.log("Polling feed "+feed_identifier);

  variables = {};

  make_request(feed_configuration, variables, function (response) { // parse response with jQuery using a page worker
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
  });
}

function create_poll_job(feed_identifier) {
  var feed_configuration = simpleStorage.storage.feeds[feed_identifier];

  return Timers.setInterval(function(){
    poll_feed(feed_identifier, feed_configuration);
  }, feed_configuration.poll_interval);
}

// set up jobs
for (feed_identifier in simpleStorage.storage.feeds) {
  jobs[feed_identifier] = create_poll_job(feed_identifier);
}

// send post function
function send_post(targets, entry) {
  for (var i=0; i<targets.length; i++) {
    var target_identifier = targets[i];
    var config = simpleStorage.storage.targets[target_identifier];

    var variables = {
      "title":entry.title ? entry.title : '',
      "body":entry.body ? entry.body : '',
      "in_reply_to": entry.in_reply_to ? entry.in_reply_to : ''
    };

    make_request(config, variables);
  }
}

// for development
require("tabs").open("http://localhost/facebook/post.html");
var feed_identifer = "test";
var feed_configuration = simpleStorage.storage.feeds["test"];
poll_feed(feed_identifier, feed_configuration);
