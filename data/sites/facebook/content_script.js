var INJECT_PROBABILITY = .5; // TODO: make configurable

// default settings; will be overwritten by extract_templates.js
var lang = "en";
var post_selector = "#home_stream > *";
var post_template = ''+
  '<li class="TearDownWalls_post">'+
  '  <hr />'+
  '  <img class="TearDownWalls_avatar" style="float:left; width:50px;">'+
  '  <div style="margin-left: 60px;">'+
  '    <p><a class="TearDownWalls_author" style="font-weight:bold;"></a><br /></p>'+
  '    <p class="TearDownWalls_content"></p>'+
  '    <span class="TearDownWalls_date" style="color:#aaa;"></span>'+
  '    <span class="TearDownWalls_show_all"><hr /><a>(show all)</a></span>'+
  '    <span>'+
  '      <div class="TearDownWalls_comment" style="clear:both;">'+
  '        <hr />'+
  '        <img class="TearDownWalls_comment_avatar" style="float:left; width:50px;">'+
  '        <div style="margin-left: 60px;">'+
  '          <a class="TearDownWalls_comment_author" style="font-weight:bold;"></a><br />'+
  '          <div class="TearDownWalls_comment_content"></div>'+
  '          <span class="TearDownWalls_comment_date" style="color:#aaa;"></span>'+
  '        </div>'+
  '      </div>'+
  '    </span>'+
  '    <hr style="clear:both;" />'+
  '    <div>'+
  '      <img class="TearDownWalls_comment_image" style="float:left;">'+
  '      <textarea class="TearDownWalls_comment_field" title="enter a comment" style="width:100%; height:1.5em; margin-bottom:.5em;">enter a comment</textarea>'+
  '    </div>'+
  '  </div>'+
  '</li>';
var comment_field_selected_diff = {
  ".mainWrapper form > div > ul.uiList":["+child_is_active"]
}

// TODO: crosspost checkbox. default should be configurable.
jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").closest("li").before('<li style="float:left; border-left:1px solid #000; border: 3px solid #ddd;">&#126;f <input type="checkbox" checked="checked" id="crosspost-to-friendica" /></li>');

// TODO: submit callback
jQuery("#pagelet_composer form[action*=updatestatus] input[type=submit]").click(function(){
  if (!jQuery("#crosspost-to-friendica").attr("checked")) return;

  var text = jQuery("#pagelet_composer form[action*=updatestatus] textarea").val();
  var title = jQuery("#pagelet_composer form[action*=updatestatus] textarea").attr("title");
  if (text==title) return;

  // send to main
  entry = {"content": text};
  self.port.emit("send-item", entry);
});

// if older posts are loaded, we also need to inject our posts. TODO: use DOM Mutation Observers
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
  if (ev.data=="load-older-posts") {
    request_entries();
  }
}, false);

function apply_class_diff(dom, diff, reverse) {
  for (selector in diff) { if (!diff.hasOwnProperty(selector)) continue;
    var changes = diff[selector];
    for (var i=0; i<changes.length; i++) {
      var change = changes[i];
      var direction = change.substr(0,1);
      var css_class = change.substr(1);

      if ((direction=="+" && !reverse) || (direction=="-" && reverse)) {
        dom.find(selector).addClass(css_class);
      }
      else {
        dom.find(selector).removeClass(css_class);
      }
    }
  }
}

function add_comments(post, comments, remove_existing) {
  // get existing comments
  var existing_comments = post.find(".TearDownWalls_comment");

  // get the first comment, which is empty and invisible and serves as template
  var comment_template = existing_comments.first();
  comment_template.hide();

  // remove all other existing comments
  if (remove_existing) {
    existing_comments.slice(1).remove();
  }

  // add the new comments, each after the previous
  var current_comment = post.find(".TearDownWalls_comment").last();

  jQuery.each(comments, function(index, comment) {
    var inject_comment = comment_template.clone().show();

    // set avatar
    avatar = inject_comment.find(".TearDownWalls_comment_avatar");
    avatar.attr("src", comment.avatar);
    avatar.attr("alt", comment.author);
    avatar.attr("title", comment.author);

    // set author
    var author = inject_comment.find(".TearDownWalls_comment_author");
    author.text(comment.author);

    // set content
    var author = inject_comment.find(".TearDownWalls_comment_content");
    author.html(comment.content);

    // set date
    var date = inject_comment.find(".TearDownWalls_comment_date");
    var iso = new Date(comment.date).toISOString();
    date.attr("title", iso);
    date.timeago();

    // append comment
    current_comment.after(inject_comment);

    current_comment = inject_comment;
  });
}

function inject_posts(posts, remove_existing) {
  // remove existing posts if necessary
  if (remove_existing) {
    jQuery(".TearDownWalls_post").remove();
  }

  // new posts should be inserted after last injected post
  native_posts = jQuery(".TearDownWalls_post").last().nextAll();
  if (!native_posts.length) {
    native_posts = jQuery(post_selector);
  }

  // go through native posts and inject our posts with a certain probability after them
  var post_index = 0;
  native_posts.each(function(index) {
    // whether to inject a post
    if (Math.random() >= INJECT_PROBABILITY) return true;

    // get the post that should be injected, incrementing post_index
    var post = posts[post_index];
    post_index++;

    // terminate if no more posts are available
    if (!post) return false;

    // construct the post that should be injected
    var injected_post = post_template.clone();

    // set avatar
    var avatar = injected_post.find(".TearDownWalls_avatar");
    avatar.attr("src", post.avatar);
    avatar.attr("alt", post.author);
    avatar.attr("title", post.author);

    // set author
    var author = injected_post.find(".TearDownWalls_author");
    author.text(post.author);

    // set date
    var date = injected_post.find(".TearDownWalls_date");
    var iso = new Date(post.date).toISOString();
    date.attr("title", iso);
    date.timeago();

    // set content
    var author = injected_post.find(".TearDownWalls_content");
    author.html(post.content);

    // check if we can hide the show all button
    if (post.sub_items_complete) {
      injected_post.find(".TearDownWalls_show_all").hide();
    }

    // add comments
    add_comments(injected_post, post.sub_items, true);

    // add callback for show all
    injected_post.find(".TearDownWalls_show_all").click(function(event) {
      event.preventDefault()

      self.port.emit("request-comments", post.feed, post.id);
    });

    // jquery.autosize.js for growing textareas
    injected_post.find(".TearDownWalls_comment_field").autosize();

    // comment field focus callback
    injected_post.find(".TearDownWalls_comment_field").focus(function() {
      var field = jQuery(this);

      // remove predefined text if necessary
      if (field.val()==field.attr("title")) {
        field.val("");
      }

      // adapt classes
      apply_class_diff(injected_post, comment_field_selected_diff);
    });

    // comment field blur callback
    injected_post.find(".TearDownWalls_comment_field").blur(function() {
      var field = jQuery(this);

      // add predefined text and adapt classes if necessary
      if (!field.val()) {
        field.val(field.attr("title"));
        apply_class_diff(injected_post, comment_field_selected_diff, true);
      }
    });

    // keydown callback to submit posts
    injected_post.find(".TearDownWalls_comment_field").keydown({"feed":post.feed, "post_id":post.id}, function(ev) {
      if (ev.keyCode!=13 || ev.shiftKey) return; // only react to return without shift pressed

      field = jQuery(this);
      var text = field.val();

      // restore blank comment field
      field.val("");
      field.blur();

      // send comment
      comment = {"content": text, "feed":ev.data.feed, "in_reply_to":ev.data.post_id};
      self.port.emit("send-item", comment);

      // display comment
      var author = ""; // TODO
      var avatar = field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_image").attr("src");
      var now = new Date().getTime();
      var content = jQuery("<div>").text(text).html(); // escape html characters

      add_comments(field.parents(".TearDownWalls_post"), [{
        "author":"",
        "avatar":avatar,
        "date":now,
        "content": content.replace("\n","<br />")
      }]);
    });

    // append important data to the post
    injected_post.data("TearDownWalls_feed", post.feed);
    injected_post.data("TearDownWalls_id", post.id);
    injected_post.data("TearDownWalls_date", post.date);

    // inject the post after the current native post
    jQuery(this).after(injected_post);
  });
}

// callback for entries
self.port.on("transmit-posts", function(posts) {
  inject_posts(posts);
});

self.port.on("transmit-comments", function(comments) {
  // get comment section of the post
  var post = jQuery(".TearDownWalls_post").filter(function() {
    if ($(this).data("TearDownWalls_feed")!=comments["feed"]) return false;
    if ($(this).data("TearDownWalls_id")!=comments["id"]) return false;
    return true;
  });

  // replace them
  add_comments(post, comments["sub_items"], true);
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

  request = native_items; // TODO: adapt to INJECT_PROBABILITY!
  if (max_request && request>max_request) request = max_request;

  // send message to main to get posts
  if (request) {
    self.port.emit("request-posts", request, 2, start_date);
  }
}

self.port.on("start", function(is_tab) {
  if (!is_tab) return; // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=777632

  if (!jQuery("#home_stream").length) return; // only if we find the home stream element

  // spawn page worker if we have no recent template
  var now = Math.round(new Date().getTime() / 1000);
  if (!( self.options.last_extract > now - 3600*24*5 )) {
    self.port.emit("start-worker", {
      "url": document.URL,
      "when": "end",
      "files": ["../../lib/jquery.js", "extract_templates.js"]
    });
  }

  // overwrite fallback template if we have a better one
  if (self.options.post_template) {
    post_template = self.options.post_template;
  }

  // set timeago locale if we have one
  if (self.options.timeago_locale) {
    jQuery.timeago.settings.strings = self.options.timeago_locale;
  }

  // convert to jquery object
  post_template = jQuery(post_template);

  // for debugging
  jQuery("head").append(jQuery('<script type="text/javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js"></script>'));

  // request entries
  request_entries();
});
