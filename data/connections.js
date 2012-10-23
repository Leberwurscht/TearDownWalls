self.port.on("set-connections", function(connections) {
  var $connections = jQuery("#connections");
  $connections.empty();

  for (var i=0; i<connections.length; i++) {
    var connection = connections[i];

    var $connection = jQuery('<div class="connection"><span class="name"></span> [<a class="delete">X</a>] (<a class="export">export</a>) used for: <div class="accounts"></div></div>');
    $connection.find(".name").text(connection.name);

    var datauri = "data:application/force-download;base64," + window.btoa(connection.export_json);
    $connection.find(".export").attr("href", datauri);

    (function(id){
      $connection.find(".delete").click(function() {
        self.port.emit("delete-connection", id);
        jQuery(this).parents(".connection:first").remove();
      });
    })(connection.id);

    $connections.append($connection);

    for (var j=0; j<connection.accounts.length; j++) {
      var account = connection.accounts[j];

      var $account = jQuery('<div class="acount"><input type="checkbox" class="enabled"> <img class="avatar"> <span class="account-name"></span> on <span class="site"></span></div>');
      $connection.find(".accounts").append($account);

      if (account.enabled) $account.find(".enabled").attr("checked", "checked");

      (function(id, site, identifier){
        $account.find(".enabled").click(function() {
          var enabled = !!jQuery(this).filter(":checked").length;
          self.port.emit("set-account", id, site, identifier, enabled);
        });
      })(connection.id, account.site, account.identifier);

      $account.find(".avatar").attr("src", account.avatar);
      $account.find(".account-name").text(account.name);
      $account.find(".site").text(account.site);
    }

    if (!$connection.find(".accounts *").length) {
      $connection.find(".accounts").append(" - no accounts -");
    }
  }
});

jQuery(document).ready(function() {
  jQuery("#import").change(function() {
    if (!this.files.length) return;

    var file = this.files.item(0);

    var reader = new FileReader();
    reader.onload = function(ev) {
      var json = ev.target.result;
      try {
        var config = JSON.parse(json);
      }
      catch (e) {
        console.log("parsing JSON failed");
        jQuery("#import").css("border", "5px solid #f00");
        var config;
      }

      self.port.emit("import", config);
    };
    reader.readAsText(file);
  });
});
