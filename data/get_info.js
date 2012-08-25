var list = [];

function convert_to_absolute(url){ // http://james.padolsey.com/javascript/getting-a-fully-qualified-url/
  var img = document.createElement('img');
  img.src = url;
  url = img.src;
  img.src = null;
  return url;
}

jQuery('link[type="application/atom+xml"]').each(function(){
  var url = jQuery(this).attr("href");
  url = convert_to_absolute(url);

  list.push({
    "type": "atom",
    "url": url,
  });
});

jQuery('link[type="application/teardownwalls_intro"]').each(function(){
  var url = jQuery(this).attr("href");
  url = convert_to_absolute(url);

  list.push({
    "type": "intro",
    "url": url,
  });
});

self.postMessage(list);
