jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").click(function(){
  if (!jQuery("#crosspost-to-friendica").attr("checked")) return;

  text = jQuery("#pagelet_composer form[action*=updatestatus] textarea").val();

  // send to main
  self.port.emit("post", text);
});

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
console.log(prototype.get(0).nodeName);

  // extract the template from the prototype
  var comment_template = extract_template(prototype, [avatar, author]);

  // add TearDownWalls_* classes
  comment_template.find(avatar).addClass("TearDownWalls_avatar");
  comment_template.find(author).addClass("TearDownWalls_author");
  comment_template.find(".commentContent").append(" ");
  comment_template.find(".commentContent").append(jQuery('<span class="TearDownWalls_content">'));

  return comment_template;
}

// callback for entries
self.port.on("transmit-entries", function(entries) {
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
      comments.append(inject_comment);
    });

    // hide "show all" if necessary and add callback
    if (entry.sub_items_complete) {
      console.log();
      inject_post.find(".TearDownWalls_show_all").hide();
    }
    else {
      inject_post.find(".TearDownWalls_show_all").click(function(event) {
        event.preventDefault()
        self.port.emit("request-comments", entry.id);
      });
    }
    });

    // set comment callback
    inject_post.find(".TearDownWalls_comment_field").attr("id", "TearDownWalls_comment_field_"+entry.id);
    inject_post.find(".TearDownWalls_comment_image").attr("id", "TearDownWalls_comment_image_"+entry.id);
    inject_post.find(".TearDownWalls_comment_field").attr("onfocus", "var image = document.getElementById('TearDownWalls_comment_image_"+entry.id+"'); if (image.style.display != 'block') { image.style.display='block'; this.value=''; }");
    inject_post.find(".TearDownWalls_comment_field").attr("onblur", "var image = document.getElementById('TearDownWalls_comment_image_"+entry.id+"'); if (this.value=='') { image.style.display='none'; this.value=this.getAttribute('title'); }");
//    inject_post.find(".TearDownWalls_comment_field").attr("onkeydown", "alert(1)");

    // inject the post
    current_post.after(inject_post);
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
