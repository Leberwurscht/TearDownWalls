jQuery(document).ready(function() {
  jQuery("#configuration").val(self.options.configuration);

  jQuery("#submit-configuration").click(function() {
    var config = jQuery("#configuration").val();
    self.port.emit("set-configuration", config);
  });
});

self.port.on("set-log", function(log) {
  var text = "";

  for (var i=0; i<log.length; i++) {
    var entry = log[i];

    var date = new Date(entry.date);
    var site_identifier = entry.site;
    var level = entry.level;
    var message = entry.message;

    text += date.toISOString()+" "+site_identifier+"("+level+"): "+message+"\n";
  }

  jQuery("#logs").text(text);
});

self.port.on("set-queue", function(queue_sizes) {
  var text = "";

  for (var i=0; i<queue_sizes.length; i++) {
    var size = queue_sizes[i];

    text += "CONNECTION "+i+": "+size+" undelivered items\n";
  }

  jQuery("#queues").text(text);
});

self.port.on("set-queue-like", function(queue_sizes) {
  var text = "";

  for (var i=0; i<queue_sizes.length; i++) {
    var size = queue_sizes[i];

    text += "CONNECTION "+i+": "+size+" undelivered likes\n";
  }

  jQuery("#like-queues").text(text);
});
