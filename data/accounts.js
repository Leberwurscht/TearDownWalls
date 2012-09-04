function list($sites, sites, select) { // sites = [account1, account2, ...], account = {avatar: ..., name: ..., url: ...}
  $sites.empty();

  for (var i=0; i<sites.length; i++) {
    var site = sites[i];
    var $site = jQuery("<div>");
    $site.attr("id", "site_"+site.name);

    var $caption = jQuery("<p>");
    $caption.text(site.name+":");
    $site.append($caption);

    var $accounts = jQuery('<div style="padding-left: 1.5em;">');

    for (var j=0; j<site.accounts.length; j++) {
      var account = site.accounts[i];
      var $account = jQuery('<div style="clear: both;">');

      if (select) {
        var $radio = jQuery('<input type="radio" name="account">');
        $radio.val(account.url);
        $account.append($radio);
      }

      var $avatar = jQuery('<img style="height: 1.5em;">');
      $avatar.attr("src", account.avatar);
      $account.append($avatar);

      $account.append(" ");

      var $caption = jQuery("<span>");
      $caption.text(account.name);
      $account.append($caption);

      if (!select) {
        $account.append(" ");

        var $delete = jQuery("<a>");
        $delete.text("X");
        $account.append(" [");
        $account.append($delete);
        $account.append("]");

        $delete.click(function() {
          self.port.emit("delete-account", account.url);
        });
      }

      $accounts.append($account);
    }

    // log in...
    var $account = jQuery('<div class="currently-logged-in">');

    if (select) {
      var $radio = jQuery('<input type="radio" name="account" value="" class="radio" style="display: none;">');
      $account.append($radio);
    }

    var $avatar = jQuery('<img class="avatar" style="height: 1.5em; display: none;">');
    $account.append($avatar);

    $account.append(" ");

    var $caption = jQuery('<span class="name" style="display:none;">');
    $account.append($caption);

    $account.append(" ");

    var $login = jQuery('<button class="login">');
    $login.text("login");
    $login.click(function() {
      console.log(site.name);
      self.port.emit("request-login", site.name);
    });
    $account.append($login);

    $accounts.append($account);

    //
    $site.append($accounts);

    $sites.append($site);
  }
}

self.port.on("currently-logged-in", function(site, account) {
  jQuery("#site_"+site).find(".radio, .avatar, .name").show();
  jQuery("#site_"+site+" .avatar").attr("src", account.avatar);
  jQuery("#site_"+site+" .name").text(account.name);
  jQuery("#site_"+site+" .login").text("login as other user");
});
