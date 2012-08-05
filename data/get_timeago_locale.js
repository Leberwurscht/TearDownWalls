self.port.on("start", function() {
  // workaround to get the jquery.timeago.js locale (it is not possible to include other js files from a content script)
  self.port.emit("set-data", {
    "timeago_locale": jQuery.timeago.settings.strings
  });

  self.port.emit("terminate");
});
