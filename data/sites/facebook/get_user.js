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

  return {
    url: own_url,
    name: own_name,
    avatar: own_avatar
  };
}

jQuery(document).ready(function() {
  var user = get_user();
  if (user) self.port.emit("logged-in", user.url, user.avatar, user.name);
});
