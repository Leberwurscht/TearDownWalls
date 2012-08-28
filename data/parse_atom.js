self.port.on("request-entries", function(xml) {
  // parse xml
  parser = new DOMParser();
  doc = parser.parseFromString(xml, "text/xml");

  // find feed element
  var feed;
  for (var i=0; i<doc.childNodes.length; i++) {
    var child = doc.childNodes[i];
    if (child.nodeType==1 && child.nodeName.toUpperCase()=="FEED") {
      feed = child;
      break;
    }
  }

  if (!feed) {
    console.log("failed to get feed element");
    return;
  }

  // loop through entry elements
  var entries = {};

  for (var i=0; i<feed.childNodes.length; i++) {
    var feed_child = feed.childNodes[i];
    if (feed_child.nodeType!=1 || feed_child.nodeName.toUpperCase()!="ENTRY") continue;
    else entry = feed_child;

    // extract information
    var id = null,
        author = null,
        avatar = null,
        date_string = null,
        title = null,
        insecure_content = null,
        in_reply_to = null,
        categories = [],
        verb = "";

    for (var j=0; j<entry.childNodes.length; j++) {
      var entry_child = entry.childNodes[j];
      if (entry_child.nodeType!=1) continue;

      if (entry_child.nodeName.toUpperCase()=="ID" && entry_child.childNodes.length) {
        id = entry_child.childNodes[0].nodeValue;
      }
      else if (entry_child.nodeName.toUpperCase()=="AUTHOR") {
        for (var k=0; k<entry_child.childNodes.length; k++) {
          var author_child = entry_child.childNodes[k];
          if (author_child.nodeType!=1) continue;

          if (author_child.nodeName.toUpperCase()=="NAME" && author_child.childNodes.length) {
            author = author_child.childNodes[0].nodeValue;
          }
          else if (author_child.nodeName.toUpperCase()=="LINK" && author_child.getAttribute("rel")=="avatar") {
            avatar = author_child.getAttribute("href");
          }
        }
      }
      else if (entry_child.nodeName.toUpperCase()=="TITLE" && entry_child.childNodes.length) {
        title = entry_child.childNodes[0].nodeValue;
      }
      else if (entry_child.nodeName.toUpperCase()=="PUBLISHED" && entry_child.childNodes.length) {
        date_string = entry_child.childNodes[0].nodeValue;
      }
      else if (entry_child.nodeName.toUpperCase()=="UPDATED" && entry_child.childNodes.length && !date_string) {
        date_string = entry_child.childNodes[0].nodeValue;
      }
      else if (entry_child.nodeName.toUpperCase()=="CONTENT" && entry_child.childNodes.length) {
        insecure_content = entry_child.textContent; // not supported by opera?
      }
      else if (entry_child.nodeName.toUpperCase()=="SUMMARY" && entry_child.childNodes.length && !insecure_content) {
        insecure_content = entry_child.textContent;
      }
      else if (entry_child.localName.toUpperCase()=="IN-REPLY-TO" && entry_child.namespaceURI=="http://purl.org/syndication/thread/1.0") {
        in_reply_to = entry_child.getAttribute("ref");
      }
      else if (entry_child.nodeName.toUpperCase()=="CATEGORY") {
        var term = entry_child.getAttribute("term");
        categories.push(term);
      }
      else if (entry_child.localName.toUpperCase()=="VERB" && entry_child.namespaceURI=="http://activitystrea.ms/spec/1.0/") {
        verb = entry_child.childNodes[0].nodeValue;
      }
    }

    // check if entry contains one of the requested categories (only for toplevel items)
    // TODO: it is unnecessary to save comments to discarded toplevel posts
    if (self.options.categories && self.options.categories.length && !in_reply_to) {
      var found = false;
      for (var j=0; j<self.options.categories.length; j++) {
        var requested_category = self.options.categories[j];

        if (categories.indexOf(requested_category) != -1) {
          found = true;
          break;
        }
      }

      if (!found) continue;
    }

    // check activitystreams verb
    if (self.options.verbs && self.options.verbs.length) {
      if (self.options.verbs.indexOf(verb)==-1) continue;
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
  }

  // process deletion requests
  var tombstones = feed.getElementsByTagNameNS("http://purl.org/atompub/tombstones/1.0", "deleted-entry");
  for (var i=0; i<tombstones.length; i++) {
    var id = tombstones[i].getAttribute("ref");
    entries[id] = false;
  }

  self.port.emit("transmit-entries", entries);
});
