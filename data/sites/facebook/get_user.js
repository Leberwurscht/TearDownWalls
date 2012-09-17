function convert_to_absolute(url){ // http://james.padolsey.com/javascript/getting-a-fully-qualified-url/
  if (typeof url != "string") return url;

  var img = document.createElement('img');
  img.src = url;
  url = img.src;
  img.src = null;
  return url;
}

function get_user() {
  var own_url = jQuery("#pagelet_welcome_box a").attr("href");
  var own_name = jQuery("#pagelet_welcome_box").text();
  var own_avatar = jQuery("#pagelet_welcome_box img").attr("src");
  own_url = convert_to_absolute(own_url);
  own_avatar = convert_to_absolute(own_avatar);

  if (!own_url) return;

  // spawn page worker if we have no recent template
  if (jQuery("#home_stream").length) {
    var data = self.options.site_data;
    var now = Math.round(new Date().getTime() / 1000);
    if (!( data.last_extract > now - 3600*24*5 )) {
      self.port.emit("start-worker", {
        "url": document.URL,
        "when": "end",
        "files": ["../../lib/jquery.js", "extract_templates.js"]
      });
    }
  }

  // make identifier from profile url: remove trailing http(s)://*.facebook.com/
  var identifier = own_url.replace(/^https?:\/\//i, "");
  identifier = identifier.replace(/^[^\/]*\.facebook.com\//i, "");
  identifier = identifier.toLowerCase(); // case insensitive

  return {
    identifier: identifier,
    url: own_url,
    name: own_name,
    avatar: own_avatar
  };
}

self.port.on("get-user", function() {
  var user = get_user();
  if (user) {
    self.port.emit("logged-in", user.identifier, user.url, user.avatar, user.name);
  }
});
