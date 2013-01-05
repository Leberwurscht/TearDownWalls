function avatar_positional_classes(parent_node, filter) {
  // Makes a list of all images within a link. This images are classified by their size and x position.
  // A list sorted by x position is returned.
  // filter = function(src, href, width, height, relative_pos) {...} can be used to exclude irrelevant images.
  var $parent_node = jQuery(parent_node);
  var parent_width = $parent_node.width();

  // build index
  var index = {};
  var identifiers = [];
  $parent_node.find("a img:visible").each(function() {
    var $img = jQuery(this);
    var $a = $img.parents("a:first");

    var width = $img.width();
    var height = $img.height();
    var pos = $img.offset();
    var left = pos.left;

    if (filter && !filter($img.attr("src"), $a.attr("href"), width, height, left/parent_width)) return true;

    var identifier = ""+Math.round(left)+" "+Math.round(width)+" "+Math.round(height);
    if (identifiers.indexOf(identifier)==-1) {
      identifiers.push(identifier);
      index[identifier] = [];
    }
    index[identifier].push(this);
  });

  // sort identifiers by left/width/height and create return list
  r = [];
  identifiers.sort();
  for (var i=0; i<identifiers.length; i++) {
    var identifier = identifiers[i];
    r.push(index[identifier]);
  }

  return r;
}

function select_avatars(positional_classes) {
  // Receives a list of avatars classified by their position and size, and selects two
  // such classes that are likely to be toplevel avatars and comment avatars.

  var toplevel_avatars, comment_avatars;

  for (var i=0; i<positional_classes.length; i++) {
    // try to find right class for toplevel avatars: each post must contain exactly one toplevel avatar
    var toplevel_avatar_candidates = positional_classes[i];

    // find first common parent of all toplevel candidates, and get list of posts
    var post_candidates = common_parent(toplevel_avatar_candidates).childNodes;

    // go through children and check if there is exactly one toplevel avatar in each of them
    var toplevel_okay = true;
    for (var j=0; j<post_candidates.length; j++) {
      var contained = 0;
      for (var k=0; k<toplevel_avatar_candidates.length; k++) {
        if (jQuery.contains(post_candidates[j], toplevel_avatar_candidates[k])) contained++;
      }

      if (contained==1) continue; // everything is okay
      if (contained==0 && !jQuery(post_candidates[j]).has("a img")) continue; // might be some sort of separator

      toplevel_okay = false;
      break;
    }
    if (!toplevel_okay) continue; // try next class of toplevel_avatar_canditates

    // now, try to get comment avatars (must have higher x value than toplevel)
    comment_avatars = undefined;
    for (j=i; j<positional_classes.length; j++) {
      // require that at least one post contains more than one comment avatar
      // so go through post candidates and check
      comment_avatar_candidates = positional_classes[j];

      var comment_okay = false;
      for (k=0; k<post_candidates.length; k++) {
        var contained = 0;
        for (var l=0; l<comment_avatar_candidates.length; l++) {
          if (jQuery.contains(post_candidates[k], comment_avatar_candidates[l])) contained++;
        }
        if (contained>1) {
          comment_okay = true;
          break;
        }
      }

      if (comment_okay) {
        comment_avatars = positional_classes[j];
        break;
      }
    }

    if (comment_avatars) {
      toplevel_avatars = positional_classes[i];
      break;
    }
  }

  return {
    toplevel: toplevel_avatars,
    comment: comment_avatars
  };
}

function cleanup() {
  // class filter
  // attribute filter
  // list of elements to retain completely
}
