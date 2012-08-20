self.port.on("request-entries", function(xml) {
  // try to determine important namespaces
  function findNS(ns) {
    var pos = xml.indexOf(ns);
    if (pos===-1) return;

    var end_pos = xml.lastIndexOf("=", pos);
    if (end_pos===-1) return;

    var start_pos = xml.lastIndexOf("xmlns:", end_pos);
    if (start_pos===-1) return;

    return xml.substring(start_pos+6, end_pos)
  }
  var namespace_tombstones = findNS("http://purl.org/atompub/tombstones/1.0");
  var namespace_thread = findNS("http://purl.org/syndication/thread/1.0");

  // create a list of entries from the feed
  var entries = {};
  j_xml = jQuery(xml);

  j_xml.find("entry").each(function(index) {
    var entry = jQuery(this);

    var id = entry.find("id").text();
    var author = entry.find("author name").text();
    if (!author) author = entry.parent().children("title").text();
    var avatar = entry.find("author link[rel=avatar]").attr("href");
    var date_string = entry.find("published").text();
    if (!date_string) date_string = entry.find("updated").text();
    var title = entry.find("title").text();
    var insecure_content = entry.find("content").text();
    if (!insecure_content) insecure_content = entry.find("summary").text();

    var in_reply_to = null;
    if (namespace_thread) {
      fully_qualified = namespace_thread + "\\:in-reply-to";
      var in_reply_to = entry.find(fully_qualified).attr("ref");
    }

    // sanitize HTML content using Google Caja to avoid XSS attacks
    var urlTransformer, nameIdClassTransformer;
    urlTransformer = nameIdClassTransformer = function(s) { return s; };
    var content = html_sanitize(insecure_content, urlTransformer, nameIdClassTransformer);

    // parse date (ISO 8601)
    var date_object = new Date(date_string);
    var date = date_object.getTime();

    entries[id] = {
      "author": author,
      "avatar": avatar,
      "in_reply_to": in_reply_to,
      "date": date,
      "title": title,
      "content": content
    };
  });

  // process deletion requests
  if (namespace_tombstones) {
    fully_qualified = namespace_tombstones + "\\:deleted-entry";

    j_xml.find(fully_qualified).each(function(index) {
      var id = jQuery(this).attr("ref");
      entries[id] = false;
    });
  }

  self.port.emit("transmit-entries", entries);
});
