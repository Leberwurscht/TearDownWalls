var account_html = ''+
'<div class="account">'+
'  <input type="radio" name="account" class="selector"> '+
'  <img class="avatar">'+
'  <span class="name"></span>'+
'  <span class="delete">[<a>X</a>]</span>'+
'</div>';

var logged_in_html = ''+
'<div class="currently-logged-in account">'+
'  <input type="radio" name="account" class="selector">'+
'  <img class="avatar">'+
'  <span class="name"></span>'+
'  <span class="add">[<a>add</a>]</span>'+
'  <button class="login">relogin</button>'+
'</div>';

function set_account($site, site, identifier, account, $account) {
  /* adds an item to the account list of a certain site, or updates the item if already exists */

  if (!$account || !$account.length) {
    var $account = jQuery(account_html);
    $site.find(".account:last").before($account);

    $account.find(".delete a").click(function() { // delete callback
      jQuery(this).parents(".account:first").remove();
      self.port.emit("delete-account", site, identifier);
    });
  }

  $account.find(".selector").val(identifier);
  $account.find(".avatar").attr("src", account.avatar);
  $account.find(".name").text(account.name);

  $account.data("info", {
    site: site,
    identifier: identifier,
    url: account.url,
    avatar: account.avatar,
    name: account.name
  });
}

self.port.on("update-accounts", function(accounts, rebuild) {
  for (var site in accounts) { if (!accounts.hasOwnProperty(site)) continue;
    var $site = jQuery("#site_"+site);
    if (!$site.length || rebuild) {
      $site.remove();

      $site = jQuery('<div id="site_'+site+'" class="site">');
      jQuery("#accounts").append($site);

      var $caption = jQuery('<div class="caption">');
      $caption.text(site);
      $site.append($caption);

      var $logged_in = jQuery('<div class="currently-logged-in account">').text("wait...");
      $site.append($logged_in);
    }

    for (var identifier in accounts[site]) { if (!accounts[site].hasOwnProperty(identifier)) continue;
      var account = accounts[site][identifier];

      if (account.logged_in) { // replace placeholder or old content
        var $account = $site.find(".currently-logged-in");
        $account.empty();

        if (account.url || account.name || account.avatar) {
          var $replacement = jQuery(logged_in_html);
          $account.replaceWith($replacement);
          $account = $replacement;

          $account.find(".add a").click(function() {
            set_account($site, site, identifier, account);
            var account_info = jQuery(this).parents(".account:first").data("info");
            self.port.emit("add-account", site, account_info);
          });
        }
        else {
          var $login = jQuery('<button class="login">').text("login");
          $account.append($login);
        }

        $account.find(".login").click(function() {
          self.port.emit("request-login", site);
        });
      }
      else {
        var $account = $site.find("input[type=radio][name=account]").filter(function(){
          return jQuery(this).val()==identifier;
        }).parents(".account:first");
      }

      set_account($site, site, identifier, account, $account);
    }
  }

  // select first radio button if none selected
  if (!jQuery("input[type=radio][name=account]:checked").length) {
    jQuery("input[type=radio][name=account]:first").attr("checked", "checked");
  }
});
