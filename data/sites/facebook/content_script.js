var POST_RATIO = 2; // TODO: make configurable, perhaps probability based

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
  '      <textarea class="TearDownWalls_comment_field" title="enter a comment">enter a comment</textarea>'+
  '    </div>'+
  '  </div>'+
  '</li>';

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

// callback for entries
self.port.on("transmit-posts", function(entries) {
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
    var avatar = inject_post.find(".TearDownWalls_avatar").first();
    avatar.attr("src", entry.avatar);
    avatar.attr("alt", entry.author);
    avatar.attr("title", entry.author);

    // set author
    var author = inject_post.find(".TearDownWalls_author").first();
    author.text(entry.author);

    // set date
    var date = inject_post.find(".TearDownWalls_date");
    var iso = new Date(entry.date).toISOString();
    date.attr("title", iso);
    date.timeago();

    // set content
    var author = inject_post.find(".TearDownWalls_content").first();
    author.html(entry.content);

    // set comments
    add_comments(inject_post, entry.sub_items, true);

    // hide "show all" if necessary and add callback
    if (entry.sub_items_complete) {
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

      post = {"content": text, "in_reply_to":event.data};
      self.port.emit("send-item", post);

      // TODO: display name
      var avatar = field.parents(".TearDownWalls_post").find(".TearDownWalls_comment_image").attr("src");
      var content = jQuery("<div>").text(text).html();
      add_comments(field.parents(".TearDownWalls_post"), [{"avatar":avatar, "author":"", "content":content}]);
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

  request = Math.ceil( native_items / POST_RATIO );
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
