self.port.on("set-connection-target", function(target) {
  if (target) {
    jQuery(".cannot-connect").hide();
    jQuery(".can-connect").show();

    var $target = jQuery("#target");
    $target.text(target.title);
    $target.data("info", target);
  }
  else {
    jQuery(".can-connect").hide();
    jQuery(".cannot-connect").show();
  }
});

jQuery(document).ready(function() {
  jQuery("#configure_accounts").click(function() {
    self.port.emit("configure-accounts");
  });
  jQuery("#configure_connections").click(function() {
    self.port.emit("configure-connections");
  });
  jQuery("#expert_mode").click(function() {
    self.port.emit("expert-mode");
  });

  jQuery("#connect").click(function() {
    var connection = jQuery("#target").data("info");
    var account = jQuery("input[type=radio][name=account]:checked").parents(".account:first").data("info");

    self.port.emit("connect", account, connection);
  });
});

self.port.on("set-expert", function(expert_mode) {
  if (expert_mode) jQuery("#expert_mode").show();
  else jQuery("#expert_mode").hide();
});
