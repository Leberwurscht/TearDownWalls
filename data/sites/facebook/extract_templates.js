// A facebook page is opened in the background inside a page worker, and this content script is attached.
// It tries to extract a post template, so that injected posts look like native posts, and saves the results using the set-data event.

// The advantage of doing it in a page worker is that we can try to get the template before the user visits the site,
// and that we can get older posts loaded if necessary, so we have a better chance that there is a post in the stream
// that is suitable for copying from.

var post_selector = "#home_stream > *";
var checkbox_selector = "#pagelet_composer #composerTourAudience";
var submit_selector = "#pagelet_composer form[action*=updatestatus] input[type=submit]";
var textarea_selector = "#pagelet_composer form[action*=updatestatus] textarea";
var comment_field_selected_diff = {
  ".mainWrapper form > div > ul.uiList":["+child_is_active"] // TODO: remove
};

// This helper function cleans up a DOM subtree by only retaining specified elements and the paths upwards.
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

// This helper function gets a prototype DOM subtree and transforms it into a template by deleting all unwanted stuff.
function transform_to_template(dom, start_selectors) {
  // remove all elements that are not parents of elements we want to keep
  upwards_cleanup(dom, start_selectors);

  // remove text nodes except ones containing only whitespace
  dom.find("*").contents().filter(function() {
    if (this.nodeType!=3) return false;
    if (this.data && this.data.match(/^\s+$/)) return false;
    return true;
  }).remove();

  // remove all attributes but 'class'
  var all_elements = dom.find("*").andSelf();
  all_elements.each(function(index, element) {
    var attributes = element.attributes.length;
    while (attributes--) {
      var attribute = element.attributes[attributes];
      if (attribute.name.toLowerCase() != "class") element.removeAttributeNode(attribute);
      // TODO: also allow style attribute
    }
  });

  // remove aid_* and live_* and other unwanted classes
  all_elements.find("*").removeClass(function(index, classes) {
    classes = " "+classes+" ";
    var delete_classes = classes.match(/(\s)aid_(\S*)(\s)|(\s)livetimestamp(\s)|(\s)comment_(\S*)(\s)|(\s)live_(\S*)(\s)|(\s)hidden_elem(\s)/g);

    if (delete_classes) return delete_classes.join();
    return "";
  });

  return dom;
}

function common_parent(elements) {
  // works by marking the path upwards from the first element,
  var path_upwards = [];
  var current_element = elements[0];
  while (current_element = current_element.parentNode) {
    path_upwards.push(current_element);
  }

  // and then cutting this path iteratively.
  for (var i=1; i<elements.length; i++) {
    var current_element = elements[i];
    while (current_element = current_element.parentNode) {
      var index = path_upwards.indexOf(current_element);
      if (index != -1) break;
    }
    var parent_element = current_element;

    path_upwards = path_upwards.slice(index);
  }

  // the first element of the remaining path is the nearest common parent
  return path_upwards[0];
}

function dom_path(element) { // returns all nodeNames from body to element as array
  var parents = element.parents();
  var nodeNames = parents.map(function() {
    var nodeName = this.nodeName.toLowerCase();
    return nodeName;
  }).get();

  return nodeNames.join(" ");
}

function most_abundant_classes(elements) {
  // create an object containing the abundances
  class_counts = {};
  elements.each(function() {
    var classes = jQuery(this).attr("class");

    if (classes) classes = classes.split(" ");
    else classes = [];

    for (var i=0; i<classes.length; i++) {
      var css_class = classes[i];

      if (!class_counts[css_class]) {
        class_counts[css_class]=1;
      }
      else {
        class_counts[css_class]++;
      }
    }
  });

  // determine the best (=most abundant) classes
  var best_count = 0;
  for (current_class in  class_counts) {
    var current_count = class_counts[current_class];
    if (current_count > best_count) {
      best_count = current_count;
    }
  }

  // construct a selector consisting of the most abundant classes
  var best_classes = "";
  for (current_class in  class_counts) {
    var current_count = class_counts[current_class];
    if (current_count==best_count) {
      best_classes += "."+current_class;
    }
  }

  return best_classes;
}

function convert_to_absolute(url){ // http://james.padolsey.com/javascript/getting-a-fully-qualified-url/
  var img = document.createElement('img');
  img.src = url;
  url = img.src;
  img.src = null;
  return url;
}

function is_profile_link() { // used in jQuery's filter method to get only profile links (has false negatives and hopefully no false positives)
  var href = jQuery(this).attr("href");
  if (!href) return false;
  if (href.indexOf("/profile.php")!=-1 && href.indexOf("and=")==-1) return true;
  if (href.match(/\.php$/)) return false;
  if (href.match(/facebook.com\/[a-zA-Z0-9.]*\.[a-zA-Z0-9.]*$/)) return true;

  return false;
}

function get_checkbox_template() {
  // TODO: find out checkbox selector using common parent element of input[type=submit] and select
  var select = "select";

  // find a prototype
  var checkbox_template = jQuery(checkbox_selector).first().clone();

  // extract template
  transform_to_template(checkbox_template, [select]);

  // replace select by a checkbox
  var checkbox = '<img class="TearDownWalls_crosspost" title="cross-post using TearDownWalls">';
  var select = checkbox_template.find(select);
  var select_parent = select.parent();
  select.remove();
  select_parent.append(jQuery(checkbox));

  return checkbox_template;
}

function get_like_button($post) {
  var $like_button = $post.find("[name=like]");
  if ($like_button.length>1) {
    self.port.emit("log", "more than one element with name=like", 0);
    $like_button = jQuery([]);
  }

  return $like_button;
}

function get_like_symbol($parent, $like_button) {
  var like_title = $like_button.attr("title");
  var $like_symbol = jQuery([]);
  $like_symbol = $parent.find(".uiUfiLikeIcon"); // try class
  if (!$like_symbol.length && like_title) { // try to get like symbol by title
    $like_symbol = $parent.find('[title="'+like_title+'"]').not($like_button);

    if ($like_symbol.length>1) {
      self.port.emit("log", "more than one element has same title as like button", 0);
      $like_symbol = jQuery([]);
    }
    else if ($like_symbol.length==1) {
      self.port.emit("log", "used title method to get like symbol", 0);
    }
  }
  if (!$like_symbol.length) { // try to get like symbol by onclick
    var $like_symbol = $parent.find("*").filter(function() {
      var onclick = jQuery(this).attr("onclick");
      if (!onclick) return false;
      return onclick.indexOf("form.like.click") != -1;
    }).not($like_button);

    if ($like_symbol.length>1) {
      self.port.emit("log", "more than one element has onclick~=form.like.click", 0);
      $like_symbol = jQuery([]);
    }
    else if ($like_symbol.length==1) {
      self.port.emit("log", "used onclick method to get like symbol", 0);
    }
  }

  return $like_symbol;
}

function get_like_list($post, date_selector) {
  $like_button = get_like_button($post);

  // find like list - first try to find like symbol (TODO: or browse likes link)
  $like_symbol = get_like_symbol($post, $like_button);

  // get at least one link that belongs to the like symbol (and not to a comment or to the post)
  // so we get the like list
  var symbol_parent = $like_symbol.get(0);
  var $like_list = jQuery([]);
  while (symbol_parent && (symbol_parent = symbol_parent.parentNode)) {
    if (jQuery(symbol_parent).has(date_selector).length) break;

    if (jQuery(symbol_parent).find("a").filter(is_profile_link).length) {
      $like_list = jQuery(symbol_parent);
      break;
    }
  }

  return $like_list;
}

function get_post_template(handler) {
  /* A good template must contain the following elements:
      * avatar
      * author
      * date
      * content
      * view all link
      * at least two comments including
        * avatar
        * author
        * content
        * date
      * comment image
      * comment field

    Moreover, all of this elements must be visible.
  */

  // choose interesting posts
  var posts = jQuery("#home_stream > *:not(:has(.passiveName))");
  if (!posts.length) return;

  // === First, we try to find selectors to be able to recognise these elements. === TODO: make efficient even for alternative methods

  // --- avatar selector ---
  var avatar_selector = ".uiProfilePhoto"; /* first guess */
  // idea: also consider position of images (offset().left)

  if (!posts.find(avatar_selector+":first").length) { // if this selector does not work, try another method:
    // get most abundant classes from images linking to profiles
    var images_with_link = posts.find("a").filter(is_profile_link).find("img");
    var candidate = most_abundant_classes(images_with_link);

    if (!candidate) {
      self.port.emit("log", "uiProfilePhoto class not found, and also found no candidate", 1);
      avatar_selector = null;
    }
    else if (posts.filter(":not(:has("+candidate+"))").length) {
      // every post should contain at least one avatar image
      self.port.emit("log", "uiProfilePhoto class not found, candidate "+candidate+" failed consistency check", 1);
      avatar_selector = null;
    }
    else {
        self.port.emit("log", "uiProfilePhoto class not found, using "+candidate+" instead", 0);
        avatar_selector = candidate;
    }
  }

  // --- date ---
  var date_selector = ".timestamp"; /* first guess */

  if (!posts.find(date_selector+":first").length) { // if this selector does not work, try another method:
    // get most abundant classes from elements with the current year in the title
    var current_year = new Date().getFullYear();
    var containing_year = posts.find("*[title*="+current_year+"]");
    var containing_year = containing_year.filter(function() { // make sure only text is contained
      return jQuery(this).children().length==0;
    });
    var candidate = most_abundant_classes(containing_year);

    if (!candidate) {
      self.port.emit("log", "timestamp class not found, and also found no candidate", 1);
      date_selector = null;
    }
    else if (posts.filter(":not(:has("+candidate+"))").length) {
      // every post should contain at least one date
      self.port.emit("log", "timestamp class not found, candidate "+candidate+" failed consistency check", 1);
      date_selector = null;
    }
    else {
        self.port.emit("log", "timestamp class not found, using "+candidate+" instead", 0);
        date_selector = candidate;
    }
  }

  // === try to get a like list template ===
  var $like_list_tpl_singular;
  var $like_list_tpl_plural;
  var like_list_text_plural;

  jQuery("#home_stream > *").each(function() {
    var $this = jQuery(this);
    $like_list = get_like_list($this, date_selector);
    // analyze like list to extract like list templates
    // X likes this
    // X and X like this
    // X, X and X like this
    // X, X, X and 15... like this
    var like_count = $like_list.find("a").filter(is_profile_link).length;
    var $collapsed = $like_list.find("a").filter(function() {
      var href = jQuery(this).attr("href");
      if (!href) return;

      return href.indexOf("/browse/likes/") != -1;
    });

    if (like_count==1 && !$collapsed.length && !$like_list_tpl_singular) { // singular
      var $ll = $like_list.clone(); // do not alter the dom
      var $ll_elements = $ll.find("*");
      $ll_elements.removeAttr("name"); // disable form elements
      $ll_elements.removeAttr("href"); // disable links
      $ll_elements.removeAttr("data-hovercard"); // remove data
      $ll_elements.removeAttr("onclick"); // TODO: on*

      var $a = $ll.find("a").filter(function() { // get text-only links
        return jQuery(this).children().length==0;
      });

      if ($a.length>1) {
        self.port.emit("log", "multiple text-only links in singular like list", 0);
        return true;
      }

      $a.addClass("TearDownWalls_like_list_item");

      var $like_button = get_like_button($this);
      var $symbol = get_like_symbol($ll, $like_button);
      $symbol.addClass("TearDownWalls_like_symbol");

      $like_list_tpl_singular = $ll;
    }
    else if (like_count>1 && $collapsed.length && !$like_list_tpl_plural) { // plural
      var $ll = $like_list.clone(); // do not alter the dom
      var $ll_elements = $ll.find("*");
      $ll_elements.removeAttr("name"); // disable form elements
      $ll_elements.removeAttr("href"); // disable links
      $ll_elements.removeAttr("data-hovercard"); // remove data
      $ll_elements.removeAttr("onclick"); // TODO: on*

      var $a = $ll.find("a").filter(function() { // get text-only links
        return jQuery(this).children().length==0 && !!jQuery(this).text();
      });

      var $first = $a.first();
      $first.addClass("TearDownWalls_like_list_item");

      var $like_button = get_like_button($this);
      var $symbol = get_like_symbol($ll, $like_button);
      $symbol.addClass("TearDownWalls_like_symbol");

      // get separator
      var $content = $first.parent().contents();
      var start_index = $content.index($first)
      var stop_index = $content.index($a.get(1))
      var separator = $content.slice(start_index+1, stop_index).text();

      // get separator for last element
      var $content = $a.last().parent().contents();
      var start_index = $content.index($a.slice(-2,-1));
      var stop_index = $content.index($a.last());
      var last_separator = $content.slice(start_index+1, stop_index).text();

      // delete everything from first to last
      var $content = $a.first().parent().contents();
      var start_index = $content.index($first);
      var $last = $a.last()
      var stop_index = $content.index($last);
      $content.slice(start_index+1, stop_index).remove();
      $last.remove();

      // get collapsed text
      var collapsed_text = $collapsed.text();

      $like_list_tpl_plural = $ll;
      like_list_text_plural = {
        collapsed: collapsed_text,
        separator: separator,
        last_separator: last_separator
      };
    }

    if ($like_list_tpl_singular && $like_list_tpl_plural) {
      return false;
    }

    /*
    find browse/likes/ link; alternative: profile links
    find uiUfiLikeIcon uiUfi / onclick~=form.like.click / same title as like button (if like button has title)
    find common parent

    */
  });

  $like_list_tpl_singular.addClass("TearDownWalls_like_list");
  $like_list_tpl_plural.addClass("TearDownWalls_like_list");

  // === Second: Filter out posts that do not have required elements (at least not visible) ===

  // each post should only have one textarea, and we want to get the ones with the most shallow nesting level to exclude reshares/passiveName posts
  var more_than_one_textarea = false;
  var min_parents;
  var filtered_posts = [];

  posts.each(function() {
    var $this = jQuery(this);
    var textareas = $this.find("textarea:visible");
    if (!textareas.length) return true;

    if (textareas.length > 1) {
      more_than_one_textarea = true;
      return true;
    }

    var parents = textareas.parents().length;
    if (parents>min_parents) return true; // only posts with minimally nested textarea

    if (!( parents==min_parents )) { // parents smaller than min_parents => start over
      min_parents = parents;
      filtered_posts = [];
    }

    // we want at least two comments, so require three visible timestamps and avatars
    var avatars = $this.find(avatar_selector+":visible");
    if (avatars.length<3) return true;

    var dates = $this.find(date_selector+":visible");
    if (dates.length<3) return true;

    // if everything is okay, add this to our list
    filtered_posts.push($this);
  });

  if (more_than_one_textarea) {
    self.port.emit("log", "more than one visible textarea encountered", 0);
  }

  if (!filtered_posts.length) {
    self.port.emit("log", "no remaining posts after filtering", -1);
    return;
  }

  // === Third: Try to sort out what are comments and what is the top level post, construct and rate templates ===
  var best_rating;
  var $best_template;
  var $original_post;
  var elements_cloned;

  jQuery.each(filtered_posts, function() {
    var $post = jQuery(this).clone();
    var current_elements_cloned = $post.find("*").get();

    // find common parent element for each date/avatar pair
    // (only used for comments, does not work for toplevel because toplevel date is assigned to wrong avatar)
    var $items = $post.find(date_selector).closest(":has("+avatar_selector+")");

    // now, try to find out which items are comments and which is the top level post
    // first method: by counting how often a dom path occurs (the one that occurs more than one time is assumed to belong for comments)
    var occurences = {};
    $items.each(function() {
      $item = jQuery(this);
      var path = dom_path($item);
      if (!occurences[path]) occurences[path] = [];
      occurences[path].push(this);
    });
    if ($items.length<3) {
      self.port.emit("log", "failed to assign avatars to dates", 0);
      return true;
    }

    var post_paths = [];
    var comment_paths = [];
    for (path in occurences) { if (!occurences.hasOwnProperty(path)) continue;
      var elements = occurences[path];

      if (elements.length>1 && comment_paths.indexOf(path)==-1) {
        comment_paths.push(path);
      }
      else if (elements.length==1 && post_paths.indexOf(path)==-1) {
        post_paths.push(path);
      }
    }

    if (post_paths.length==1 && comment_paths.length==1 && 0) {
      var comment_path = comment_paths[0];
      var $comments = jQuery(occurences[comment_path]);
    }
    // if this did not work, try second method:
    // assume all comments have a common parent element, but the top level post is not contained
    else {
      // select three items
      var i1 = $items[0];
      var i2 = $items[1];
      var i3 = $items[2];

      // get common parent elements
      var c1 = common_parent([i1, i2]);
      var c2 = common_parent([i2, i3]);
      var c3 = common_parent([i3, i1]);

      // check if we got two times the same common parent
      if (c1==c2) {
        var comment_parent = c3;
      }
      else if (c2==c3) {
        var comment_parent = c1;
      }
      else if (c3==c1) {
        var comment_parent = c2;
      }

      // find items that are contained in comment parent
      var $comments = $items.filter(function() {
        return jQuery.contains(comment_parent, this);
      });
      if (!$comments.length>=2) {
        self.port.emit("log", "failed to get enough comment elements with common parent method", 0);
        return true;
      }

      // make sure exactly one item remains
      if ($items.not($comments).length != 1) {
        self.port.emit("log", "wrong number of non-comment items", 0);
        return true;
      }
    }

    // get largest comment-containing element
    var comments = $comments.get();
    var comment_parent = common_parent(comments);
    var $comments = $comments.closest( jQuery(comment_parent).children() );

    // find toplevel avatar
    var $avatar = $post.find("a "+avatar_selector).filter(function() {
      // not inside comment
      return $comments.has(this).length==0;
    });
    if (!$avatar.length) {
      self.port.emit("log", "toplevel avatar not found", 1);
      return true;
    }
    else if ($avatar.length>1) {
      self.port.emit("log", "too many toplevel avatars", 0);
      return true;
    }

    // find toplevel author: a text-only link, not inside a comment, with same URL as avatar
    // this could also match a link in the like list, but we exclude posts with more than one match
    var avatar_url = $avatar.closest("a").attr("href");

    var $author = $post.find('a[href="'+avatar_url+'"]').filter(function() {
      var $this = jQuery(this);

      // not inside comment
      if ($comments.has(this).length) return false;

      // text-only link
      if ($this.children().length) return false;

      // same URL as avatar
      return $this.attr("href")==avatar_url;
    });

    if (!$author.length) {
      self.port.emit("log", "toplevel author not found", 0);
    }
    else if ($author.length>1) {
      self.port.emit("log", "too many matches for toplevel author", 0);
      return true;
    }

    // find toplevel date
    var $date = $post.find(date_selector).filter(function() {
      // not inside comment
      return $comments.has(this).length==0;
    });
    if (!$date.length) {
      self.port.emit("log", "toplevel date not found", 1);
      return true;
    }
    else if ($date.length>1) {
      self.port.emit("log", "too many toplevel dates", 0);
      return true;
    }

    // find show all
    var $show_all = $post.find(".uiUfiViewAll"); /* first guess */
    if (!$show_all.length) { // if this does not work, try another method:
      $show_all = $post.find("[name^=view_all]");
    }

    // do not log if no show all element found - not every post has one
    if ($show_all.length>1) {
      self.port.emit("log", "too many matches for show all", 0);
      return true;
    }

    // find content
    var $content = $post.find(".messageBody"); /* first guess - TODO: fallback: most abundant class name of elements containing common emoticons */
    if (!$content.length) {
      self.port.emit("log", "messageBody class not found", 0);
    }
    else if ($content.length>1) {
      self.port.emit("log", "too many matches for toplevel content", 0);
      return true;
    }

    // keep only one comment
    $comments.slice(1).remove();
    $comments = $comments.first();

    // find comment avatar
    var $comment_avatar = $comments.find(avatar_selector);
    if (!$comment_avatar.length) {
      self.port.emit("log", "comment avatar not found", 1);
      return true;
    }
    else if ($comment_avatar.length>1) {
      self.port.emit("log", "too many comment avatars", 0);
      return true;
    }

    // find comment author: a text-only link, with same URL as avatar
    var avatar_url = $comment_avatar.closest("a").attr("href");

    var $comment_author = $comments.find('a[href="'+avatar_url+'"]').filter(function() {
      var $this = jQuery(this);

      // text-only link
      if ($this.children().length) return false;

      // same URL as avatar
      return $this.attr("href")==avatar_url;
    });

    if (!$comment_author.length) {
      self.port.emit("log", "could not find comment author", 0);
    }
    else if ($comment_author.length>1) {
      self.port.emit("log", "too many matches for comment author", 0);
      return true;
    }

    // find comment date
    var $comment_date = $comments.find(date_selector);
    if (!$comment_date.length) {
      self.port.emit("log", "comment date not found", 1);
      return true;
    }
    else if ($comment_date.length>1) {
      self.port.emit("log", "too many comment dates", 0);
      return true;
    }

    // find like button and list
    $like_button = get_like_button($post);
    $like_list = get_like_list($post, date_selector);

    // find comment content
    var $comment_content = $post.find(".commentBody"); /* first guess - TODO: fallback: most abundant class name of elements containing common emoticons */
    if ($comment_content.length>1) {
      self.port.emit("log", "too many matches for comment content", 0);
      return true;
    }

    // find comment field and image
    var $comment_field = $post.find("textarea");
    var $comment_field_avatar_container = $comment_field.closest(":has("+avatar_selector+")");
    var $other_images = $avatar.add($comment_avatar);
    var $comment_field_avatar = $comment_field_avatar_container.find(avatar_selector).not($other_images);
    if ($comment_field_avatar.length != 1) {
      self.port.emit("log", "failed to get comment image - got "+$comment_field_avatar.length, 0);
      $comment_field_avatar = jQuery([]);
    }

    // rate template: count how many fallbacks we need
    var rating = 0;

    /* not necessary to check avatar */
    if (!$author.length) rating -= 1;
    /* not necessary to check date */
    if (!$content.length) rating -= 1;

    if (!$show_all.length) rating -= 1;

    /* not necessary to check comment avatar */
    if (!$comment_author.length) rating -= 1;
    /* not necessary to check comment date */
    if (!$comment_content.length) rating -= 1;

    if (!$like_button.length) rating -= 1;
    if (!$like_list.length) rating -= 0.9;

    /* not necessary to check comment field */
    /* do not care about comment image */

    // stop here if we already have a better template
    if (best_rating>=rating) return true;

    // fix the template if we can
    if (!$author.length && $content.length) {
      $author = jQuery("<a>");
      $div = jQuery('<div class="actorName">');
      $div.append($author);
      $content.before($div);
    }
    else if ($author.length && !$content.length) {
      $content = jQuery('<div class="messageBody">');
      $author.after($content);
    }
    else if (!$author.length && !$content.length) {
      self.port.emit("log", "could not fix template - no author and content", 0);
      return true;
    }

    if (!$show_all.length) {
      $dummy_comment = transform_to_template($comments.clone(), [avatar_selector]);
      $show_all = jQuery("<a>show all</a>");
      $dummy_comment.find(avatar_selector).parents("a:first").replaceWith($show_all);
      $comments.before($dummy_comment);
    }

    if (!$comment_author.length && $comment_content.length) {
      $comment_author = jQuery('<a class="actorName">');
      $comment_content.before($comment_author);
    }
    else if ($comment_author.length && !$comment_content.length) {
      $content = jQuery('<span class="commentBody">');
      $author.after($content);
    }
    else if (!$comment_author.length && !$comment_content.length) {
      self.port.emit("log", "could not fix template - no comment author and content", 0);
      return true;
    }

    if (!$like_button.length) {
      $like_button = jQuery('<a>like this</a>');

      if ($date.parents("a:first").length) {
        $date.parents("a:first").after(" ");
        $date.parents("a:first").after($like_button);
      }
      else {
        $date.after(" ");
        $date.after($like_button);
      }
    }

    if (!$like_list.length) {
      $dummy_comment = transform_to_template($comments.clone(), [avatar_selector]);
      $like_list = jQuery('<div>');
      $dummy_comment.find(avatar_selector).parents("a:first").replaceWith($like_list);
      $comments.before($dummy_comment);
    }

    // set markers
    $post.addClass("TearDownWalls_post");
    $avatar.addClass("TearDownWalls_avatar");
    $author.addClass("TearDownWalls_author");
    $date.addClass("TearDownWalls_date");
    $content.addClass("TearDownWalls_content");
    $show_all.addClass("TearDownWalls_show_all");
    $comments.addClass("TearDownWalls_comment");
    $comment_avatar.addClass("TearDownWalls_comment_avatar");
    $comment_author.addClass("TearDownWalls_comment_author");
    $comment_date.addClass("TearDownWalls_comment_date");
    $comment_content.addClass("TearDownWalls_comment_content");
    $comment_field_avatar.addClass("TearDownWalls_comment_field_avatar");
    $comment_field.addClass("TearDownWalls_comment_field");
    $like_button.addClass("TearDownWalls_like_button");
    $like_list.addClass("TearDownWalls_like_list");

    best_rating = rating;
    $best_template = $post;
    elements_cloned = current_elements_cloned;
    $original_post = jQuery(this);
  });

  var orig_elements = $original_post.find("*").get();
  var classes_before = jQuery.map(orig_elements, function(element) {
    return jQuery(element).attr("class") || "";
  });

  // connect focus callback
  var $comment_field = $original_post.find("textarea");

  $comment_field.focus(function() {
    jQuery(this).trigger("focus-callbacks-done");
  });

  $comment_field.bind("focus-callbacks-done", function() {
    var complete_diff = {};

    var classes_after = jQuery.map(orig_elements, function(element) {
      return jQuery(element).attr("class") || "";
    });

    for (var i=0; i<classes_before.length; i++) {
      var element_cloned = elements_cloned[i];
      var before = classes_before[i].split(" ");
      var after = classes_after[i].split(" ");

      var diff=[];

      // get minus
      for (var j=0; j<before.length; j++) {
        var css_class = before[j];
        if (after.indexOf(css_class)==-1) {
          diff.push("-"+css_class);
        }
      }

      // get plus
      for (var j=0; j<after.length; j++) {
        var css_class = after[j];
        if (before.indexOf(css_class)==-1) {
          diff.push("+"+css_class);
        }
      }

      if (diff.length) {
        var classname = "TearDownWalls_diff"+i;
        jQuery(element_cloned).addClass(classname);
        complete_diff["."+classname] = diff;
      }
    }

    // save show all completely before cleanup
    var $show_all = $best_template.find(".TearDownWalls_show_all").clone();
    var $show_all_elements = $show_all.find("*").andSelf();
    $show_all_elements.removeAttr("name"); // disable form elements
    $show_all_elements.removeAttr("href"); // disable links
    $show_all_elements.removeAttr("data-ft"); // TODO: data-*
    $show_all_elements.removeAttr("onclick"); // TODO: on*
    $show_all_elements.val(function(index,value){ if (value) return value.replace(/[0-9]+\s*/,""); }); // remove comment count
    $show_all_elements.text(function(index,text){ if (text) return text.replace(/[0-9]+\s*/,""); }); // remove comment count

    // save like button completely before cleanup
    var $like = $best_template.find(".TearDownWalls_like_button").clone();
    var $like_elements = $like.find("*").andSelf();
    $like_elements.removeAttr("name"); // disable form elements
    $like_elements.removeAttr("href"); // disable links
    $like_elements.removeAttr("onclick");
    $like_elements.removeAttr("data-ft"); // remove data

    // save separator after like button
    var node_after_button = $best_template.find(".TearDownWalls_like_button").get(0).nextSibling;
    if (node_after_button && node_after_button.nodeType == 3) {
      var like_separator = node_after_button.nodeValue.match(/[^a-zA-Z0-9]*/);
    }
    else {
      var like_separator = "";
    }

    // save comment field placeholder before cleanup
    var placeholder = $best_template.find(".TearDownWalls_comment_field").val();

    // extract the template from the prototype
    transform_to_template($best_template, [".TearDownWalls_avatar", ".TearDownWalls_author", ".TearDownWalls_date", ".TearDownWalls_content", ".TearDownWalls_show_all", ".TearDownWalls_comment_avatar", ".TearDownWalls_comment_author", ".TearDownWalls_comment_date", ".TearDownWalls_comment_content", ".TearDownWalls_comment_field_avatar", ".TearDownWalls_comment_field", ".TearDownWalls_like_button", ".TearDownWalls_like_list"]);

    // replace show all with saved and processed version
    $best_template.find(".TearDownWalls_show_all").replaceWith($show_all);

    // replace like button with saved and processed version
    $best_template.find(".TearDownWalls_like_button").replaceWith($like);
    $best_template.find(".TearDownWalls_like_button").after(document.createTextNode(like_separator));

    // reinsert placeholder
    $best_template.find(".TearDownWalls_comment_field").attr("title", placeholder);
    $best_template.find(".TearDownWalls_comment_field").text(placeholder);
    $best_template.find(".TearDownWalls_comment_field").val(placeholder);

    // call handler now that we are done
    handler($best_template, $like_list_tpl_singular, $like_list_tpl_plural, like_list_text_plural, complete_diff);
  });

  // dispatch focus event for comment field
  var ev = document.createEvent('Event');
  ev.initEvent("focus", true, true);
  $comment_field.get(0).dispatchEvent(ev);
}

self.port.on("start", function() {
  // do nothing if we already have a recent template
  var now = Math.round(new Date().getTime() / 1000);
  if ( self.options.site_data.last_extract > now - 3600*24*5 ) return;

  // extract language, needed for localization of jquery.timeago.js
  var lang = jQuery("html").attr("lang");

  // get localization of jquery.timeago.js - this is an ugly workaround for the fact that we cannot include files from content scripts.
  // Start a page worker with the right localization and a script that saves the localization using set-data.
  if (lang) self.port.emit("start-worker", {
      "url": "about:blank",
      "when": "end",
      "files": [
        "../../lib/jquery.js",
        "../../lib/jquery.timeago.js",
        "../../lib/jquery.timeago.locales/jquery.timeago."+lang.toLowerCase()+".js",
        "../../get_timeago_locale.js"
      ]
  });

  // extract templates
  console.log("extracting templates");
  get_post_template(function($post_template, $like_list_tpl_singular, $like_list_tpl_plural, like_list_text_plural, comment_field_selected_diff) {
    var html_post = $post_template.wrap("<div>").parent().html();

    var $checkbox_template = get_checkbox_template();
    var html_checkbox = $checkbox_template.wrap("<div>").parent().html();
    var html_like_list_singular = $like_list_tpl_singular.wrap("<div>").parent().html();
    var html_like_list_plural = $like_list_tpl_plural.wrap("<div>").parent().html();

    console.log("all templates extracted and processed");

    self.port.emit("set-data", {
      "post_template": html_post,
      "post_selector": post_selector,
      "like_list_tpl_singular": html_like_list_singular,
      "like_list_tpl_plural": html_like_list_plural,
      "like_list_text_plural": like_list_text_plural,
      "crosspost_template": html_checkbox,
      "crosspost_selector": checkbox_selector,
      "submit_selector": submit_selector,
      "textarea_selector": textarea_selector,
      "comment_field_selected_diff": comment_field_selected_diff,
      "last_extract": now
    });

    self.port.emit("terminate"); // TODO: also terminate if get_post_template fails
  });
});
