self.port.on("query-account", function(type, target, title, accounts) {
  if (type && target) {
    jQuery(".can-connect").show();
    jQuery(".cannot-connect").hide();
    if (title) {
      jQuery("#target").text(title);
    }
    else {
      jQuery("#target").text(target);
    }

    list(jQuery("#accounts"), accounts, true);

    jQuery("#connect").click(function() {
      console.log(jQuery("input[name=account]:checked").length);
      var identifier = jQuery("input[name=account]:checked").val();
      var site = jQuery("input[name=account]:checked").data("site");
      var avatar = jQuery("input[name=account]:checked").data("avatar");
      var name = jQuery("input[name=account]:checked").data("name");
      var url = jQuery("input[name=account]:checked").data("url");

      self.port.emit("account-selected", type, target, site, identifier, url, avatar, name);
    });
  }
  else {
    jQuery(".can-connect").hide();
    jQuery(".cannot-connect").show();
  }

  jQuery("#config-accounts").click(function() {
    self.port.emit("config-accounts");
  });
  jQuery("#config-connections").click(function() {
    self.port.emit("config-connections");
  });
  jQuery("#expert-mode").click(function() {
    self.port.emit("expert-mode");
  });
});

self.port.on("set-expert", function(expert_mode) {
  if (expert_mode) jQuery("#expert-mode").show();
  else jQuery("#expert-mode").hide();
});
