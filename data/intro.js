// list of identities
var $identities = jQuery("#identities");

if (self.options.type=="atom") {
  jQuery("#identity_field").hide();
}

for (url in self.options.identities) { if (!self.options.identities.hasOwnProperty(url)) continue;
  var identity = self.options.identities[url];

  var $option = jQuery("<div>");
  var $checkbox = jQuery('<input type="radio" name="identity">');
  $checkbox.attr("value", url);
  $option.append($checkbox);

  $option.append(" ");
  $img = jQuery("<img>");
  $img.attr("src", identity.avatar);
  $img.css("height", "1.5em");
  $option.append($img);

  $option.append(" ");
  $span = jQuery("<span>");
  $span.attr("title", url);
  $span.text(identity.name);
  $option.append($span);

  $identities.append($option);
}

jQuery("input[name=identity]").change(function() {
  var $custom_radio = jQuery("#custom_radio");
  if ($custom_radio.attr("checked")) {
    jQuery("#custom").show();
  }
  else {
    jQuery("#custom").hide();
  }
});

$identities.find("input[name=identity]").first().attr("checked","checked");

// list of sites
var $sites = jQuery("#sites");
jQuery.each(self.options.sites, function(index, site) {
  $site = jQuery("<div>");

  $checkbox = jQuery('<input type="checkbox" value="1">');
  $checkbox.attr("name", "site_"+site);

  $site.append($checkbox);
  $site.append(" ");
  $site.append(site);

  $sites.append($site);
});

jQuery("input[name^=site_]").first().attr("checked", "checked");

// submit callback
$('#intro').submit(function() {
  // get identity
  var identity = jQuery("input[name=identity]:checked").val();
  if (!identity) { // custom identity
    var url = jQuery("input[name=url]").val();
    var name = jQuery("input[name=name]").val();
    var avatar = jQuery("input[name=avatar]").val();
  }
  else {
    var url = identity;
    var name = self.options.identities[url].name;
    var avatar = self.options.identities[url].avatar;
  }

  // get sites
  var sites = [];
  for (var i=0; i<self.options.sites.length; i++) {
    var site = self.options.sites[i];
    console.log(jQuery("input[name=site_"+site+"]").length);
    console.log(jQuery("input[name=site_"+site+"]").val());
    if (jQuery("input[name=site_"+site+"]:checked").length) {
      sites.push(site);
    }
  }

  // send event
  self.port.emit("submit", url, name, avatar, sites);

  return false;
});
