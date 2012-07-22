var POST_RATIO = 2;

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").closest("li").before('<li style="float:left; border-left:1px solid #000; border: 3px solid #ddd;">&#126;f <input type="checkbox" checked="checked" id="crosspost-to-friendica" /></li>');

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").click(function(){
  if (!jQuery("#crosspost-to-friendica").attr("checked")) return;

  text = jQuery("#pagelet_composer form[action*=updatestatus] textarea").val();

  // send to main
  self.port.emit("post", text);
});


// 
//console={}; console.log=function(text){ jQuery(".mainWrapper:first").append(jQuery("<p>").text(text)); };

function upwards_cleanup(dom, start_selectors) {
  // first, mark all elements for deletion
  dom.find("*").addClass("_to_be_deleted");

  // go through start selectors, and preserve the paths from the selected elements upwards
  jQuery.each(start_selectors, function(index, start_selector) {
    dom.find(start_selector).parentsUntil(dom).andSelf().removeClass("_to_be_deleted");
  });

  // delete all elements that are still marked to be deleted
  dom.find("._to_be_deleted").remove();
}

//
function extract_template(prototype, start_selectors) {
  var dom = prototype.clone();

  // remove all elements that are not parents of elements we want to keep
  upwards_cleanup(dom, start_selectors);

  // remove text nodes
  dom.find("*").contents().filter(function() {
    return this.nodeType==3;
  }).remove();

  // remove all attributes but 'class'
  var all_elements = dom.find("*").andSelf();
  all_elements.each(function(index, element) {
    var attributes = element.attributes.length;
    while (attributes--) {
      var attribute = element.attributes[attributes];
      if (attribute.name.toLowerCase() != "class") element.removeAttributeNode(attribute);
    }
  });

  // remove aid_* and live_* classes
  all_elements.find("*").removeClass(function(index, classes) {
    classes = " "+classes+" ";
    var delete_classes = classes.match(/(\s)aid_(\S*)(\s)|(\s)live_(\S*)(\s)|(\s)hidden_elem(\s)/g)

    if (delete_classes) return delete_classes.join();
    return "";
  });

  return dom;
}

function get_post_template() {
  // define selectors
  var stream = "ul#home_stream > li";
  var avatar = "img.uiProfilePhoto:first";
  var author =  ".mainWrapper a:first";
  var date = ".mainWrapper .uiStreamFooter .timestamp";
  var comments =  ".mainWrapper > form.commentable_item:not([class*=collapsed_comments]) .commentList:first";
  var comment_image =  ".uiUfiAddComment img.uiProfilePhoto";
  var comment_field =  ".commentArea textarea";

  // find a proper prototype (one with a comment section)
  var prototype = jQuery(stream).find(comments).first().parents(stream).first();

  // extract the template from the prototype
  var post_template = extract_template(prototype, [avatar, author, date, comments, comment_image, comment_field]);

  // copy the inner text of the comment field and the hidden image
  var comment_text = prototype.find(comment_field).text();
  post_template.find(comment_field).text(comment_text);
  post_template.find(comment_field).attr("title", comment_text);
  post_template.find(comment_image).replaceWith( prototype.find(comment_image).clone() );

  // add TearDownWalls_* classes
  post_template.addClass("TearDownWalls_post");
  post_template.find(avatar).addClass("TearDownWalls_avatar");
  post_template.find(author).addClass("TearDownWalls_author");
  post_template.find(date).addClass("TearDownWalls_date");
  post_template.find(".mainWrapper :first").after(jQuery('<div class="TearDownWalls_content">'));
  post_template.find(comments).addClass("TearDownWalls_comments");
  post_template.find(comment_image).addClass("TearDownWalls_comment_image");
  post_template.find(comment_field).addClass("TearDownWalls_comment_field");

console.log("CLEANED POST: "+post_template.clone().wrap("<div>").html());
//console.log(": "+prototype.find(comments).clone().wrap("<div>").html());
  return post_template;
}

function get_comment_template() {
  // define selectors
  var comment =  ".mainWrapper > form.commentable_item:not([class*=collapsed_comments]) .commentList .uiUfiComment:first";
  var avatar = "img.uiProfilePhoto:first";
  var author =  ".commentContent a:first";

  // find a prototype
  var prototype = jQuery(comment).first();
console.log(prototype.get(0).nodeName);

  // extract the template from the prototype
  var comment_template = extract_template(prototype, [avatar, author]);

  // add TearDownWalls_* classes
  comment_template.find(avatar).addClass("TearDownWalls_avatar");
  comment_template.find(author).addClass("TearDownWalls_author");
  comment_template.find(".commentContent").append(" ");
  comment_template.find(".commentContent").append(jQuery('<span class="TearDownWalls_content">'));

//console.log("CLEANED COMMENT: "+comment_template.clone().wrap("<div>").html());
//console.log(": "+prototype.find(comments).clone().wrap("<div>").html());
  return comment_template;
}

function attribute_whitelist(element, attributes) {
    var i = element.attributes.length;
    while( i-- ) {
      var attr = element.attributes[i];
      if (jQuery.inArray(attr.name.toLowerCase(), attributes)==-1) element.removeAttributeNode(attr);
    }
}


function extract_templates() {
  // clone a native entry, also save headline for later
  var template = jQuery("ul#home_stream > li:first").clone();
  var headline = template.find(".mainWrapper").children().first().clone().empty();

  // ... delete unneeded stuff
  template.find(".mainWrapper").empty();
  template.find(".highlightSelector").remove(); // what is this?

  // ... but keep first entry of .mainWrapper, which contains the headline
  template.find(".mainWrapper").append(headline);

  // ... strip all attributes but class
  template.find("*").each(function(index) {
    attribute_whitelist(this, ["class"]);
  });
  attribute_whitelist(template.get(0), ["class"]);

  // add div for injected content
  template.find(".mainWrapper").append('<div class="TearDownWalls_content">')

  // find a comment list
  var comment_list = jQuery("ul#home_stream .commentList").first();
//jQuery(".mainWrapper:first").append(comment_list.clone());

  // extract template for one comment, also save headline for later
  var comment_template = comment_list.children().last().clone();
  var headline = comment_template.find(".commentContent").children().first().clone().empty();
//console.log(jQuery("<div>").append(headline).html())

  // ... delete unneeded stuff
  comment_template.find(".commentContent").empty();
  comment_template.find(".commentRemoverButton").remove();

  // ... but keep first entry of .commentContent, which contains the headline
  comment_template.find(".commentContent").append(headline);

  // ... strip all attributes but class
  comment_template.find("*").each(function(index) {
    attribute_whitelist(this, ["class"]);
  });
  attribute_whitelist(comment_template.get(0), ["class"]);

  // copy upwards stopping at .mainWrapper
  var current_element = comment_list;

  // clone and cleanup comment list
  var comments_template = current_element.clone().empty()
  attribute_whitelist(comments_template.get(0), ["class"]);

  while (true) {
    // get parent element
    var current_element = current_element.parent();
//    console.log("current element set to "+current_element.get(0).nodeName+" . "+current_element.attr("class"));
    if (current_element.hasClass("mainWrapper")) break;
//    console.log("will be processed...");

    // clone and cleanup parent element
    parent_template = current_element.clone().empty();
//    console.log("cloned");
    attribute_whitelist(parent_template.get(0), ["class"]);
//    console.log("whitelisted");

//    console.log("parent_template is now "+parent_template.get(0).nodeName+" . "+parent_template.attr("class"));

    // extend current template by parent element
    parent_template.append(comments_template);
    comments_template = parent_template;
  }

//  console.log(jQuery("<div>").append(comments_template).html());
//  console.log("COMMENT TEMPLATE:");
//  console.log(jQuery("<div>").append(comment_template).html());

  // in case we hit a hidden comments section, make it visible
  comments_template.removeClass("collapsed_comments");

  template.find(".mainWrapper").append(comments_template);
//console.log(comment_template.html());

  return {
    "post_template": template,
    "comment_template": comment_template
  };
}

// callback for entries
self.port.on("transmit-entries", function(entries) {
//  es = []; // TODO
//  for (e in entries) es.push(entries[e]);
//  entries = es;

  // TODO: there is some class that contains an id
//  console.log("POST TPL: "+get_post_template().wrap("<div>").html());

  post_template = get_post_template();
  comment_template = get_comment_template();

  // go through the home stream
  jQuery("ul#home_stream > li").each(function(index) {
    // skip some native entries
    if (index % POST_RATIO != 0) return true;

    // get some feed entry to inject into the site
    var post_nr = Math.round(index/POST_RATIO);

    var entry;
    if (!( entry = entries[post_nr] )) return false;

    // we will inject this entry after the current post
    var current_post = jQuery(this);
    var inject_post = post_template.clone();

    // set avatar
    var avatar = inject_post.find(".TearDownWalls_avatar");
    avatar.attr("src", entry.avatar);
    avatar.attr("alt", entry.author);
    avatar.attr("title", entry.author);

    // set author
    var author = inject_post.find(".TearDownWalls_author");
    author.text(entry.author);

    // // set date - not implemented yet
    // var date = inject_post.find(".TearDownWalls_date");
    // var date_str = ... entry.date ...
    // date.text(date_str);

    // set content
    var author = inject_post.find(".TearDownWalls_content");
    author.html(entry.content);

    // set comments
    comments = inject_post.find(".TearDownWalls_comments");

    jQuery.each(entry.sub_items, function(index, comment) {
      var inject_comment = comment_template.clone();

      // set avatar
      avatar = inject_comment.find(".TearDownWalls_avatar");
      avatar.attr("src", comment.avatar);
      avatar.attr("alt", comment.author);
      avatar.attr("title", comment.author);

      // set author
      var author = inject_comment.find(".TearDownWalls_author");
      author.text(comment.author);

      // set content
      var author = inject_comment.find(".TearDownWalls_content");
      author.html(comment.content);

      // append comment
      comments.last().before(inject_comment);
    });

    // set comment callback
    inject_post.find(".TearDownWalls_comment_field").attr("id", "TearDownWalls_comment_field_"+entry.id);
    inject_post.find(".TearDownWalls_comment_image").attr("id", "TearDownWalls_comment_image_"+entry.id);
//    inject_post.find(".TearDownWalls_comment_field").attr("onfocus", "var image = document.getElementById('TearDownWalls_comment_image_"+entry.id+"'); if (image.style.display.toLowerCase()=='none') { image.style.display='block'; this.textContent=''; }");
    inject_post.find(".TearDownWalls_comment_field").attr("onfocus", "var image = document.getElementById('TearDownWalls_comment_image_"+entry.id+"'); if (image.style.display != 'block') { image.style.display='block'; this.value=''; }");
    inject_post.find(".TearDownWalls_comment_field").attr("onblur", "var image = document.getElementById('TearDownWalls_comment_image_"+entry.id+"'); if (this.value=='') { image.style.display='none'; this.value=this.getAttribute('title'); }");
//    inject_post.find(".TearDownWalls_comment_field").attr("onkeydown", "alert(1)");

    // inject the post
    current_post.after(inject_post);
  });

// return;
// 
//   // go through the home stream
//   jQuery("ul#home_stream > li").each(function(index) {
//     // skip some native entries
//     if (index % POST_RATIO != 0) return true;
// 
//     // get some feed entry to inject into the site
//     post_nr = Math.round(index/POST_RATIO);
//     if (!( entry = entries[post_nr] )) return false;
// 
//     // we will inject this entry after the current li entry
//     var li_before = jQuery(this);
// 
//     var inject_li = templates["post_template"].clone();
// 
//     // adapt avatar image
// //    img = inject_li.find(".actorPhoto img").first();
//     img = inject_li.find("img.uiProfilePhoto").first();
//     img.attr("src", entry.avatar);
//     img.attr("alt", entry.author);
//     img.attr("title", entry.author);
// //    img.attr("width", "50px");
// 
//     // write author name into headline
//     a = jQuery("<a>");
//     a.text(entry.author);
//     a.attr("href", "#");
//     a.attr("class", "passiveName");
//     inject_li.find(".mainWrapper").children().first().append(a);
// 
//     // write content
//     var div = jQuery("<div>");
//     div.html(entry.content);
// //div.html("<h1>content</h1>");
//     inject_li.find(".mainWrapper .TearDownWalls_content").html(entry.content);
// 
//     // write comments
//       console.log("LENGTH "+entry.sub_items.length);
//     for (comment_nr in entry.sub_items) {
//       comment = entry.sub_items[comment_nr];
//       console.log(comment.content);
//       comment_li = templates["comment_template"].clone();
// //      comment_li
//       comment_li.find(".commentContent").append(" ");
//       comment_li.find(".commentContent").append(jQuery("<span>").html(comment.content));
// 
//     img = comment_li.find("img.uiProfilePhoto").first();
//     img.attr("src", comment.avatar);
//     img.attr("alt", comment.author);
//     img.attr("title", comment.author);
// //    img.attr("width", "50px");
// 
//       comment_li.find(".commentContent").children().first().text(comment.author);
// 
//       inject_li.find(".commentList").append(comment_li);
//     }
// 
//     li_before.after(inject_li);
// //    li_before.after(templates["post_template"].clone());
// 
// return true;
//     // clone the native entry and adapt it...
//     inject_li = li_before.clone();
// 
//     // ... delete unneeded stuff
//     inject_li.find(".mainWrapper").empty();
//     inject_li.find(".highlightSelector").empty(); // what is this?
// 
//     // ... but keep first entry of .mainWrapper
//     var headline = li_before.find(".mainWrapper").first().clone().empty();
//     inject_li.find(".mainWrapper").append(headline);
// 
//     // ... strip all attributes but class
//     inject_li.find("*").each(function(index) {
//       var i = this.attributes.length;
//       while( i-- ) {
//         var attr = this.attributes[i];
//         if (attr.name.toLowerCase()!="class") this.removeAttributeNode(attr);
//       }
//     });
// 
//     // adapt avatar image
//     img = inject_li.find(".actorPhoto img").first();
//     img.attr("src", entry.avatar);
//     img.attr("alt", entry.author);
//     img.attr("title", entry.author);
//     img.attr("width", "50px");
// 
//     // write author name into headline
//     a = jQuery("<a>");
//     a.text(entry.author);
//     a.attr("href", "#");
//     a.attr("class", "passiveName");
//     headline.append(a);
// 
//     // write content
//     div = jQuery("<div>");
//     div.html(entry.content);
// //    div.text(JSON.stringify(entry));
//     inject_li.find(".mainWrapper").append(div);
// 
//     // inject the feed entry
//     li_before.after(inject_li);
//   });
});

// ul.home_stream
if (jQuery("ul#home_stream").length) {
  request = Math.ceil( jQuery("ul#home_stream > li").length / POST_RATIO );

  // send message to main to get posts
  self.port.emit("request-entries", request, 2);
}

// for debugging
jQuery("head").append(jQuery('<script type="text/javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/1.4.4/jquery.min.js"></script>'));
