var POST_RATIO = 2;

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").closest("li").before('<li style="float:left; border-left:1px solid #000; border: 3px solid #ddd;">&#126;f <input type="checkbox" checked="checked" id="crosspost-to-friendica" /></li>');

jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").click(function(){
  if (!jQuery("#crosspost-to-friendica").attr("checked")) return;

  var text = jQuery("#pagelet_composer form[action*=updatestatus] textarea").val();
  var title = jQuery("#pagelet_composer form[action*=updatestatus] textarea").attr("title");
  if (text==title) return;

  // send to main
  entry = {"body": text};
  self.port.emit("send-post", entry);
});

// if older posts are loaded, we also need to inject our posts.
// TODO: must be put into a <script> tag which must be injected into the facebook page
var script =
  'if(!UIIntentionalStream.instance) UIIntentionalStream.instance={};\n'+ // for debugging
  'if(!UIIntentionalStream.instance.loadOlderPosts) UIIntentionalStream.instance.loadOlderPosts=function(){};\n'+ // for debugging
  '\n'+
  'UIIntentionalStream.instance.loadOlderPosts = (function(){\n'+
  '  var original_loadOlderPosts = UIIntentionalStream.instance.loadOlderPosts;\n'+

  '  function new_loadOlderPosts() {\n'+
  '    var return_value = original_loadOlderPosts(); /* execute original function */\n'+

  '    window.postMessage("load-older-posts", "*");\n'+
  '\n'+
  '    return return_value;\n'+
  '  }\n'+
  '\n'+
  '  return new_loadOlderPosts;\n'+
  '})();\n';

// inject the javascript
// http://wiki.greasespot.net/Content_Script_Injection
var script_tag = document.createElement('script');
script_tag.setAttribute("type", "application/javascript");
script_tag.textContent = script;
document.body.appendChild(script_tag);
document.body.removeChild(script_tag);

document.defaultView.addEventListener("message", function(ev) {
  if (ev.data!="load-older-posts") return;
  console.log("LOAD OLDER POSTS"); // TODO

  request_entries();
}, false);

//

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

function inject_comments(parent_element, comment_template, comments) {
  jQuery.each(comments, function(index, comment) {
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
    parent_element.append(inject_comment);
  });
}

// callback for entries
self.port.on("transmit-entries", function(entries) {
  post_template = get_post_template();
  comment_template = get_comment_template();

  // new items should be appended
  native_items = jQuery("ul#home_stream > li.TearDownWalls_post:last").nextAll();
  if (!native_items.length) {
    native_items = jQuery("ul#home_stream > li");
  }

  // go through the home stream
  native_items.each(function(index) {
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
    inject_comments(comments, comment_template, entry.sub_items);

    // hide "show all" if necessary and add callback
    if (entry.sub_items_complete) {
      console.log();
      inject_post.find(".TearDownWalls_show_all").hide();
    }
    else {
      inject_post.find(".TearDownWalls_show_all").click(function(event) {
        event.preventDefault()


        self.port.emit("request-comments", entry.feed, entry.id);
      });
    }

    // set comment callbacks
    inject_post.find(".TearDownWalls_comment_field").focus(function() {
      var image = jQuery(this).parents(".TearDownWalls_post").find(".TearDownWalls_comment_image");
      if (image.filter(":visible").length) return true;

      image.show();
      jQuery(this).val("");
    });

    inject_post.find(".TearDownWalls_comment_field").blur(function() {
      field = jQuery(this);
      if (field.val()) return true;

      field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_image").hide();
      field.val(field.attr("title"));
    });

    inject_post.find(".TearDownWalls_comment_field").keydown(entry.id, function(event) {
      if (event.keyCode != 13) return;

      field = jQuery(this);
      field.blur();

      field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_image").hide();
      var text = field.val();
      field.val(field.attr("title"));

      post = {"body": text, "in_reply_to":event.data};
      self.port.emit("send-post", post);

      // TODO: display name
      var comments_section = field.parents(".TearDownWalls_post").find(".TearDownWalls_comments");
      var avatar = field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_image").attr("src");
      inject_comments(comments_section, get_comment_template(), [{"avatar":avatar, "author":"", "content":text}]);
    });

    inject_post.data("TearDownWalls_feed", entry.feed);
    inject_post.data("TearDownWalls_id", entry.id);
    inject_post.data("TearDownWalls_date", entry.date);

    // inject the post
    current_post.after(inject_post);
  });
});

self.port.on("transmit-comments", function(comments) {
  // get comment section of the post
  var post = jQuery(".TearDownWalls_post").filter(function() {
    if ($(this).data("TearDownWalls_feed")!=comments["feed"]) return false;
    if ($(this).data("TearDownWalls_id")!=comments["id"]) return false;
    return true;
  });
  var comments_section = post.find(".TearDownWalls_comments");

  // delete all comments
  comments_section.find(".TearDownWalls_comment").remove();

  // replace them
  var parent_element = inject_comments(comments_section, get_comment_template(), comments["sub_items"]);
});

function request_entries(max_request) {
  var last_injected_post = jQuery(".TearDownWalls_post:last");
  if (last_injected_post.length) {
    var start_date = last_injected_post.data("TearDownWalls_date");
    start_date = parseInt(start_date);

    var native_items = last_injected_post.nextAll().length;
  }
  else {
    var start_date = null;

    var native_items = jQuery("ul#home_stream > li").length;
  }

  request = Math.ceil( native_items / POST_RATIO );
  if (max_request && request>max_request) request = max_request;

  // send message to main to get posts
  if (request) {
    self.port.emit("request-entries", request, 2, start_date);
  }
}

request_entries();

// for debugging
jQuery("head").append(jQuery('<script type="text/javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js"></script>'));
