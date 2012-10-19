var Self = require("self");
var Panel = require("panel");

var guiAccounts = require("./gui_accounts");

var accounts_panel;

function run() {
  if (accounts_panel) accounts_panel.destroy();

  accounts_panel = Panel.Panel({
    width: 800,
    height: 600,
    contentURL: Self.data.url("accounts.html"),
    contentScriptFile: [Self.data.url("lib/jquery.js"), Self.data.url("accounts.js")]
  });

  guiAccounts.setup_listeners(accounts_panel);
  guiAccounts.set_accounts(accounts_panel, true);

  accounts_panel.show();
}

exports.run = run;
