self.port.on("query-account", function(type, target, accounts) {
  if (type && target) {
    jQuery(".can-connect").show();
    jQuery(".cannot-connect").hide();
    jQuery("#target-name").text(target);

    list(jQuery("#accounts"), accounts, true);

    jQuery("#connect").click(function() {
      console.log(jQuery("input[name=account]:checked").length);
      var url = jQuery("input[name=account]:checked").val();
      var site = jQuery("input[name=account]:checked").data("site");
      var avatar = jQuery("input[name=account]:checked").data("avatar");
      var name = jQuery("input[name=account]:checked").data("name");

      self.port.emit("account-selected", type, target, site, url, avatar, name);
    });
  }
  else {
    jQuery(".can-connect").hide();
    jQuery(".cannot-connect").show();
  }
});
