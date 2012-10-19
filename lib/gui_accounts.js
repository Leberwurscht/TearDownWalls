var Self = require("self");
var simpleStorage = require("simple-storage");

var Sites = require("./sites");
var Lib = require("./lib");

function list_of_accounts() {
  /* helper function that creates a list of configured accounts for each site */

  var accounts = {};

  for (var i=0; i<Sites.sites.length; i++) {
    var site = Sites.sites[i];

    accounts[site] = {};
    var configuration = simpleStorage.storage.accounts[site].configuration;
    for (identifier in configuration) { if (!configuration.hasOwnProperty(identifier)) continue;
      var account_configuration = configuration[identifier];

      accounts[site][identifier] = {
        name: account_configuration.name,
        avatar: account_configuration.avatar,
        url: account_configuration.url,
      };
    }
  }

  return accounts;
}

function get_logged_in_users(handler) {
  /* helper function that tries to get the currently logged in user for each site */

  for (var i=0; i<Sites.sites.length; i++) {
    var site = Sites.sites[i];

    var config_json = Self.data.load("sites/"+site+"/configuration.json");
    var config = JSON.parse(config_json).get_user;

    var worker = Sites.create_page_worker(site, config);

    worker.port.on("logged-in", function(account) {
      account.logged_in = true;
      handler(site, account);
    });

    worker.port.emit("get-user");
  }
}

function request_login(site, handler) {
  /* helper function that leads the user to a login page for a specified site, and gets his account information */

  if (Sites.sites.indexOf(site)==-1) return;

  var config_json = Self.data.load("sites/"+site+"/configuration.json");
  var config = JSON.parse(config_json).relogin;

  var windows = require("windows").browserWindows;
  var win = windows.open({
    url: config.url.replace("https://","http://"), // TODO: remove call to replace, was only for development
    onOpen: function(win) {
      var tab = win.tabs[0];

      Sites.addon_tabs.push(tab);
      tab.on("close", function() {
        var index = Sites.addon_tabs.indexOf(tab);
        Sites.addon_tabs.splice(index, 1);
      });

      var setup_worker = function() {
        var site_data = simpleStorage.storage.accounts[site].site_data;
        var account_data = simpleStorage.storage.accounts[site].account_data;

        var worker = tab.attach({
          contentScriptWhen: config.when,
          contentScriptFile: Lib.data_urls(config.files, "sites/"+site),
          contentScriptOptions: {
            site_data: site_data,
            account_data: account_data
          }
        });

        worker.port.on("logged-in", function(account) {
          tab.close();

          account.logged_in = true;
          handler(account);
        });

        return worker;
      }

      tab.once("ready", function() {
        // try to log out user
        var worker = setup_worker();
        worker.port.emit("log-out");

        // redirect user to login page afterwards
        // also send get-user already here: if user is already on login page, no redirect is made, so next page load is already profile page
        tab.once("ready", function() {
          var worker = setup_worker();
          worker.port.emit("redirect");
          worker.port.emit("get-user");

          // after that, send get-user
          tab.on("ready", function() {
            var worker = setup_worker();
            worker.port.emit("get-user");
          });
        });
      });
    }
  });
}

function set_accounts(panel, rebuild) {
  /*
    Sets up list of accounts by sending event update-list(accounts)
  */

  // set list of accounts
  var accounts = list_of_accounts();
  panel.port.emit("update-accounts", accounts, rebuild);

  // try to get currently logged in user for each site
  get_logged_in_users(function(site, account) {
    if (account) {
      accounts = {};
      accounts[site] = {};
      accounts[site][account.identifier] = account;
      panel.port.emit("update-accounts", accounts);
    }
    else {
      accounts = {};
      accounts[site] = {};
      accounts[site][""] = {logged_in: true};
      panel.port.emit("update-accounts", accounts);
    }
  });
}

function setup_listeners(panel) {
  /*
    Reacts to following events:
      - add-account(account)
      - delete-account(account)
      - request-login(site)
  */

  // react to add-account event
  panel.port.on("add-account", function(site, account) {
    account.connections = [];
    simpleStorage.storage.accounts[site].configuration[account.identifier] = account;
  });

  // react to delete-account event
  panel.port.on("delete-account", function(site, identifier) {
    delete simpleStorage.storage.accounts[site].configuration[identifier];
  });

  // react to request-login event
  panel.port.on("request-login", function(site) {
    request_login(site, function(account) {
      panel.show();

      if (account) {
        accounts = {};
        accounts[site] = {};
        accounts[site][account.identifier] = account;
        panel.port.emit("update-accounts", accounts);
      }
      else {
        accounts = {};
        accounts[site] = {};
        accounts[site][""] = {logged_in: true};
        panel.port.emit("update-accounts", accounts);
      }
    });
  });
}

exports.set_accounts = set_accounts;
exports.setup_listeners = setup_listeners;
