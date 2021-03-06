var inject_after;
var crossposting;

var native_post_appeared = false;

var user;

// default settings; will be overwritten by extract_templates.js
var post_selector = "#home_stream > *";
var post_template = ''+
  '<li class="TearDownWalls_post">'+
  '  <hr />'+
  '  <img class="TearDownWalls_avatar" style="float:left; width:50px;">'+
  '  <div style="margin-left: 60px;">'+
  '    <p><a class="TearDownWalls_author" style="font-weight:bold;"></a><br /></p>'+
  '    <p class="TearDownWalls_content"></p>'+
  '    <a class="TearDownWalls_like_button">like this</a> <span class="TearDownWalls_date" style="color:#aaa;"></span>'+
  '    <span><hr /><div class="TearDownWalls_like_symbol"></div></span>'+
  '    <span class="TearDownWalls_like_list"></span>'+
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
var crosspost_selector = '#pagelet_composer #composerTourAudience';
var crosspost_template = '<li style="float:left;"><img class="TearDownWalls_crosspost" title="cross-post using TearDownWalls"></li>';
var submit_selector = "#pagelet_composer form[action*=updatestatus] input[type=submit]";
var textarea_selector = "#pagelet_composer form[action*=updatestatus] textarea";
var comment_field_selected_diff = {
  ".mainWrapper form > div > ul.uiList":["+child_is_active"]
};
var like_list_tpl_singular = '<hr /><a class="TearDownWalls_like_list_item"></a> likes this.<br />';
var like_list_tpl_plural = '<hr /><a class="TearDownWalls_like_list_item"></a> like this.<br />';
var like_list_text_plural = {
  collapsed: "5 others",
  separator: ", ",
  last_separator: " and "
};

// to setup DOM MutationObserver (or Mutation Events as fallback for older browsers) when new native posts appear (when user scrolls down)
function on_native_post(parent_element, callback) {
  function call_callback() {
    if (!native_post_appeared) console.log("WARNING: something is wrong with mutation observers/events");

    native_post_appeared = false;
    callback();
  }

  function defer_execution(element) {
    if (native_post_appeared) return true; // only once
    if (element.parentNode != parent_element) return true; // only for direct descendants
    if (jQuery(element).hasClass("TearDownWalls_post")) return true; // not for injected posts

    native_post_appeared = true;
    setTimeout(call_callback, 20); // wait some time for more posts to appear
  }

  if (!window.MutationObserver) {
    console.log("warning: using mutation events");

    parent_element.addEventListener("DOMNodeInserted", function(ev) {
     defer_execution(ev.target);
    }, false);
  }
  else {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        var addedNodes = mutation.addedNodes;
        for (var i=0; i<addedNodes.length; i++) {
          var element = addedNodes[i];
          defer_execution(element);
        }
      });
    });

    observer.observe(parent_element, {childList: true});
  }
}

// to insert/delete classes when the user clicks into a comment box
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

function add_like_list(post, likes, add) {
  var $like_list = post.find(".TearDownWalls_like_list");

  if (add) {
    var all_likes = [];

    var new_likes = likes;
    var old_likes = post.data("likes");
    if (!old_likes) old_likes = [];

    for (var i=0; i<old_likes.length; i++) all_likes.push(old_likes[i]);
    for (var i=0; i<new_likes.length; i++) all_likes.push(new_likes[i]);

    likes = all_likes;
  }

  if (likes.length==1) {
    var $ll = like_list_tpl_singular.clone();
    var $item = $ll.find(".TearDownWalls_like_list_item");
    $item.text(likes[0].author);

    $like_list.replaceWith(jQuery($ll.wrap("<div>").parent().html())); // strange: $like_list.replaceWith($ll) does not work
  }
  else if (likes.length>1) {
    var $ll = like_list_tpl_plural.clone();

    var $item = $ll.find(".TearDownWalls_like_list_item");
    $item.text(likes[0].author);

    for (var i=1; i<likes.length-1; i++) {
      var like = likes[i];

      var $last_item = $ll.find(".TearDownWalls_like_list_item:last");
      var $item = $last_item.clone();

      $item.text(like.author);

      $last_item.after($item);
      $item.before(like_list_text_plural.separator);
    }

    var $last_item = $ll.find(".TearDownWalls_like_list_item:last");
    var $item = $last_item.clone();

    $item.text(likes[likes.length-1].author);

    $last_item.after($item);
    $item.before(like_list_text_plural.last_separator);

    $like_list.replaceWith(jQuery($ll.wrap("<div>").parent().html()));
  }

  post.data("likes", likes);
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
  var likes = [];

  jQuery.each(comments, function(index, comment) {
    // treat likes
    if (comment.verb=="http://activitystrea.ms/schema/1.0/like") {
      likes.push(comment);
      return true;
    }

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

  // add like list
  add_like_list(post, likes);

  // adjust width of images (workaround - max-width: 100% does not seem to work)
  post.find(".TearDownWalls_comment_content img").css("max-width", (jQuery(post_selector).width()*.8 - 65)+"px");
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

  // go through native posts and inject our posts
  var injected_so_far = jQuery(".TearDownWalls_post").length;
  var native_so_far = jQuery(".TearDownWalls_post").last().prevAll().andSelf().length - injected_so_far;

  var post_index = 0;
  native_posts.each(function(index) {
    // whether to inject a post
    var last_injected_index = injected_so_far*inject_after;
    var next_injected_index = last_injected_index + inject_after;
    var next_native_index = native_so_far + 1;
    native_so_far++;

    if (!( next_injected_index < next_native_index )) return true;

    // get the post that should be injected, incrementing post_index
    while (true) {
      // get one post
      var post = posts[post_index];
      post_index++;

      // terminate if no more posts are available
      if (!post) return false;

      // keep trying until we get a real post
      if (post.verb != "http://activitystrea.ms/schema/1.0/like") break; // skip only likes
    }

    injected_so_far++;

    // construct the post that should be injected
    var injected_post = post_template.clone();

    // set own avatar
    var avatar = injected_post.find(".TearDownWalls_comment_field_avatar");
    avatar.attr("src", user.avatar);

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
      event.preventDefault();

      self.port.emit("request-comments", post.feed, post.id);
    });

    // add callback for click on author: configuration of inject_after
    injected_post.find(".TearDownWalls_author").click(function(event) {
      event.preventDefault();

      answer = window.prompt("How many facebook posts do you want between non-facebook posts?", inject_after);
      if (answer = parseInt(answer)) {
        inject_after = answer;

        self.port.emit("set-data", {
          "inject_after": inject_after
        }, user.identifier);
      }
    });

    // add callback for like button - TODO: hide if commenting not possible
    like_callback = function(event) {
      event.preventDefault();

      self.port.emit("like-item", post.id, [post.feed]);

      var author = user.name;
      button = jQuery(this);
      add_like_list(button.parents(".TearDownWalls_post"), [{"author":author}], true);
    };
    injected_post.find(".TearDownWalls_like_button").click(like_callback);
    injected_post.find(".TearDownWalls_like_symbol").click(like_callback);

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
    injected_post.find(".TearDownWalls_comment_field").keydown({"connection":post.feed, "post_id":post.id}, function(ev) {
      if (ev.keyCode!=13 || ev.shiftKey) return; // only react to return without shift pressed

      field = jQuery(this);
      var text = field.val();

      // restore blank comment field
      field.val("");
      field.blur();

      // send comment
      comment = {"content": text, "connections":[ev.data.connection], "in_reply_to":ev.data.post_id};
      self.port.emit("send-item", user.identifier, comment);

      // display comment
      var author = user.name;
      var avatar = field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_field_avatar").attr("src");
      var now = new Date().getTime();
      var content = jQuery("<div>").text(text).html(); // escape html characters

      add_comments(field.parents(".TearDownWalls_post"), [{
        "author":author,
        "avatar":avatar,
        "date":now,
        "content": content.replace("\n","<br />")
      }]);
    });

    // disable comment field if necessary
    if (!post.commenting_possible) {
      injected_post.find(".TearDownWalls_comment_field").attr("disabled", "disabled");
      injected_post.find(".TearDownWalls_comment_field").val("------------");
      injected_post.find(".TearDownWalls_comment_field").removeAttr("title");
    }

    // append important data to the post
    injected_post.data("TearDownWalls_connection", post.feed);
    injected_post.data("TearDownWalls_id", post.id);
    injected_post.data("TearDownWalls_date", post.date);

    // adjust width of images (workaround - max-width: 100% does not seem to work)
    injected_post.find(".TearDownWalls_content img").css("max-width", jQuery(post_selector).width()*.8+"px");

    // inject the post after the current native post
    jQuery(this).after(injected_post);
  });
}

// setup crossposting
function inject_crosspost() {
  function update_image() {
    if (crossposting) {
      var url = self.options.exposed["../../activated.png"];
    }
    else {
      var url = self.options.exposed["../../deactivated.png"];
    }

    jQuery(".TearDownWalls_crosspost").attr("src", url);
  }

  // construct from template
  var toggle_crosspost = jQuery(crosspost_template);

  // connect callback
  toggle_crosspost.click(function() {
    crossposting = !crossposting;

    self.port.emit("set-data", {
      "crossposting": crossposting
    }, user.identifier);

    update_image();
  });

  // inject image
  jQuery(crosspost_selector).after(toggle_crosspost);

  // set image url
  update_image();

  // connect submit callback
  jQuery(submit_selector).click(function(){
    if (!crossposting) return; // only if crossposting is activated

    var textarea = jQuery(textarea_selector);
    var text = textarea.val();
    var title = textarea.attr("title");
    if (text==title || !text) return; // only if textarea contains a valid text

    // send to main
    post = {"content": text};
    self.port.emit("send-item", user.identifier, post);
  });
}

// log-out callback
self.port.on("log-out", function() {
  console.log("logging out of facebook");
  jQuery("#logout_form").submit();
});

// callback for posts
self.port.on("transmit-posts", function(posts) {
  inject_posts(posts);
});

self.port.on("transmit-comments", function(comments) {
  // get the post
  var post = jQuery(".TearDownWalls_post").filter(function() {
    if ($(this).data("TearDownWalls_connection")!=comments["feed"]) return false;
    if ($(this).data("TearDownWalls_id")!=comments["id"]) return false;
    return true;
  });

  // replace the comments
  add_comments(post, comments["sub_items"], true);
});

function request_posts(max_request) {
  // calculate how many post we need to inject
  var injected_posts_so_far = jQuery(".TearDownWalls_post").length;
  var all_posts = jQuery(post_selector).length;
  var native_posts = all_posts - injected_posts_so_far;

  var injected_posts_wanted = Math.floor(native_posts / inject_after);
  var request = injected_posts_wanted - injected_posts_so_far;

  // get the date of the last injected post
  var last_injected_post = jQuery(".TearDownWalls_post:last");
  if (last_injected_post.length) {
    var start_date = last_injected_post.data("TearDownWalls_date");
    start_date = parseInt(start_date);
  }
  else {
    var start_date = null;
  }

  // limit to max_request
  if (max_request && request>max_request) request = max_request;

  // send message to main to get posts
  if (request) {
    self.port.emit("request-posts", user.identifier, request, 2, start_date);
  }
}

self.port.on("start", function() {
  // only for certain users
  user = get_user();
  if (!user || !self.options.account_data[user.identifier]) return;

  //
  crossposting = self.options.account_data[user.identifier].crossposting;
  inject_after = self.options.account_data[user.identifier].inject_after;
  if (!inject_after) inject_after = 5.0;

  if (!jQuery(post_selector).length) return; // only if this site contains a posts section

  // get data
  var data = self.options.site_data;

  // overwrite fallback post selector and template if extract_templates.js was successful
  if (data.post_selector) {
    post_selector = data.post_selector;
  }
  if (data.post_template) {
    post_template = data.post_template;
  }

  // overwrite fallback crosspost selector and template if extract_templates.js was successful
  if (data.crosspost_selector) {
    crosspost_selector = data.crosspost_selector;
  }
  if (data.crosspost_template) {
    crosspost_template = data.crosspost_template;
  }

  // overwrite fallback submit button selector if extract_templates.js was successful
  if (data.submit_selector) {
    submit_selector = data.submit_selector;
  }

  // overwrite fallback textarea selector if extract_templates.js was successful
  if (data.textarea_selector) {
    textarea_selector = data.textarea_selector;
  }

  // overwrite fallback diff if extract_templates.js was successful
  if (data.comment_field_selected_diff) {
    comment_field_selected_diff = data.comment_field_selected_diff;
  }

  // overwrite fallback like list templates if extract_templates.js was successful
  if (data.like_list_tpl_singular) {
    like_list_tpl_singular = data.like_list_tpl_singular;
  }
  if (data.like_list_tpl_plural) {
    like_list_tpl_plural = data.like_list_tpl_plural;
  }
  if (data.like_list_text_plural) {
    like_list_text_plural = data.like_list_text_plural;
  }

  // set timeago locale if we have one
  if (data.timeago_locale) {
    jQuery.timeago.settings.strings = data.timeago_locale;
  }

  // convert to jquery objects
  post_template = jQuery(post_template);
  like_list_tpl_singular = jQuery(like_list_tpl_singular);
  like_list_tpl_plural = jQuery(like_list_tpl_plural);

  // insert crosspost checkbox
  if (self.options.crosspost_accounts.indexOf(user.identifier) != -1) {
    inject_crosspost();
  }

  // listen for new native posts, into which we need to inject our posts again
  var parent_element = jQuery(post_selector).parent().get(0);
  on_native_post(parent_element, function(){
    request_posts();
  });

  // request posts
  request_posts();
});
