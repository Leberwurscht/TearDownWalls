var POST_RATIO = 2;

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").closest("li").before('<li style="float:left; border-left:1px solid #000; border: 3px solid #ddd;">&#126;f <input type="checkbox" checked="checked" id="crosspost-to-friendica" /></li>');

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").click(function(){
  if (!jQuery("#crosspost-to-friendica").attr("checked")) return;

  text = jQuery("#pagelet_composer form[action*=updatestatus] textarea").val();

  // send to main
  self.port.emit("post", text);
});

// callback for entries
self.port.on("transmit-entries", function(entries) {
  es = []; // TODO
  for (e in entries) es.push(entries[e]);
  entries = es;

  // go through the home stream
  jQuery("ul#home_stream > li").each(function(index) {
    // skip some native entries
    if (index % POST_RATIO != 0) return true;

    // get some feed entry to inject into the site
    post_nr = Math.round(index/POST_RATIO);
    if (!( entry = entries[post_nr] )) return false;

    // we will inject this entry after the current li entry
    var li_before = jQuery(this);

    // clone the native entry and adapt it...
    inject_li = li_before.clone();

    // ... delete unneeded stuff
    inject_li.find(".mainWrapper").empty();
    inject_li.find(".highlightSelector").empty(); // what is this?

    // ... but keep first entry of .mainWrapper
    var headline = li_before.find(".mainWrapper :first").clone().empty();
    inject_li.find(".mainWrapper").append(headline);

    // ... strip all attributes but class
    inject_li.find("*").each(function(index) {
      var i = this.attributes.length;
      while( i-- ) {
        var attr = this.attributes[i];
        if (attr.name.toLowerCase()!="class") this.removeAttributeNode(attr);
      }
    });

    // adapt avatar image
    img = inject_li.find(".actorPhoto img").first();
    img.attr("src", entry.avatar);
    img.attr("alt", entry.author);
    img.attr("title", entry.author);
    img.attr("width", "50px");

    // write author name into headline
    a = jQuery("<a>");
    a.text(entry.author);
    a.attr("href", "#");
    a.attr("class", "passiveName");
    headline.append(a);

    // write content
    div = jQuery("<div>");
    div.html(entry.content);
//    div.text(JSON.stringify(entry));
    inject_li.find(".mainWrapper").append(div);

    // inject the feed entry
    li_before.after(inject_li);
  });
});

// ul.home_stream
if (jQuery("ul#home_stream").length) {
  request = Math.ceil( jQuery("ul#home_stream > li").length / POST_RATIO );

  // send message to main to get posts
  self.port.emit("request-entries", request, 2);
}

// for debugging
jQuery("head").append(jQuery('<script type="text/javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/1.4.4/jquery.min.js"></script>'));
