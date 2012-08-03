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
  var comments =  ".mainWrapper > form.commentable_item:not([class*=collapsed_comments]) .commentList";
  var comment_image =  ".uiUfiAddComment img.uiProfilePhoto";
  var comment_field =  ".commentArea textarea";

  // find a proper prototype (one with a comment section)
  var prototype = jQuery(stream).find(comments).first().parents(stream).first();

  // extract the template from the prototype
  var post_template = extract_template(prototype, [avatar, author, date, comments, comment_image, comment_field]);

  // copy "view all" - TODO: only works if the right post is in the news feed
  var show_all = jQuery(stream+" "+comments+" .uiUfiViewAll").first().clone();
  var show_all_input = show_all.find("input");
  var show_all_text = show_all_input.val().replace(/[0-9]+ /, "");
  show_all_input.val(show_all_text);
  show_all_input.removeAttr("data-ft");
  post_template.find(comments).append(show_all);

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
  show_all.addClass("TearDownWalls_show_all");
  post_template.find(comments).addClass("TearDownWalls_comments");
  post_template.find(comment_image).addClass("TearDownWalls_comment_image");
  post_template.find(comment_field).addClass("TearDownWalls_comment_field");

  return post_template;
}

function get_comment_template() {
  // define selectors
  var comment =  ".mainWrapper > form.commentable_item:not([class*=collapsed_comments]) .commentList .uiUfiComment:first";
  var avatar = "img.uiProfilePhoto:first";
  var author =  ".commentContent a:first";

  // find a prototype
  var prototype = jQuery(comment).first();

  // extract the template from the prototype
  var comment_template = extract_template(prototype, [avatar, author]);

  // add TearDownWalls_* classes
  comment_template.addClass("TearDownWalls_comment");
  comment_template.find(avatar).addClass("TearDownWalls_avatar");
  comment_template.find(author).addClass("TearDownWalls_author");
  comment_template.find(".commentContent").append(" ");
  comment_template.find(".commentContent").append(jQuery('<span class="TearDownWalls_content">'));

  return comment_template;
}

self.port.on("start", function() {
  // do nothing if we already have a recent template
  var now = Math.round(new Date().getTime() / 1000);
  if ( self.options.last_extract > now - 3600*24*5 ) return;

  var post_template = get_post_template();
  var comment_template = get_comment_template();

  post_template.find(".TearDownWalls_comments").append(comment_template);
  var html = post_template.wrap("<div>").html();

  self.port.emit("set-data", {
    "post_template": html,
    "last_extract": now
  });
});
