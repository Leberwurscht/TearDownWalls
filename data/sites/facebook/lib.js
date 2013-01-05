function is_profile_link_permissive(href) { // may have false positives
  if (!href) return false;
  if (href.indexOf("/profile.php")!=-1 && href.indexOf("and=")==-1) return true;
  if (href.match(/\.php(\?.*)?$/)) return false;
  if (href.match(/facebook.com\/[^\/]*(\?.*)?$/)) return true;

  return false;
}

function is_profile_link_strict(href) { // may have false negatives
  if (!href) return false;
  if (href.indexOf("/profile.php")!=-1 && href.indexOf("and=")==-1) return true;
  if (href.match(/\.php(\?.*)?$/)) return false;
  if (href.match(/facebook.com\/[a-zA-Z0-9.]*\.[a-zA-Z0-9.]*$/)) return true; // only with point
//  if (href.match(/facebook.com\/[^\/]*\.[^\/]*$/)) return true;

  return false;
}
