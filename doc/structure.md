Structure of TearDownWalls
==========================

* Posts are stored in a sqlite database which is managed by lib/database.js
* The content scripts for a walled garden are stored in the directory data/sites/SITE_NAME/, which must also contain a file called configuration.json. This file lists the page mods and page workers and references the respective content scripts.
* data/sites/index.json must list all SITE_NAMEs
* Posts are collected by polling atom feeds. This is done by data/parse_atom.js
* The page mods and page workers for a specific walled garden communicate with lib/main.js over a well-defined interface by exchanging messages.
  * The content scripts may send the following messages:
    * request-entries(toplevel, comments, start_date) requests the 'toplevel' newest posts, each with the 'comments' most recent comments, that are newer than start_date.
    * request-comments(feed, id, max_comments) requests the 'max_comments' newest comments for a post specified by feed and id
    * send-post(post) where post has properties title, content, in_reply_to: sent when a post was composed within the walled garden which should also be sent to the federated social web
    * set-data(data) can be used if the content scripts need to store data.
    * log(message, level) can be used to log errors.
    * start-worker(url, scripts) can be used to start a page worker. scripts is an array of content scripts, relative to the directory data/sites/SITE_NAME/
  * The content script may react to the following messages:
    * transmit-data(data) is sent as soon as a content script is ready and transmits the data that was set using set-data earlier.
    * transmit-entries(posts) in response to request-entries where posts is an array of toplevel posts. Each toplevel post has the properties feed, id, author, avatar, date, title, content, sub_items, sub_items_complete. sub_items is an array of comments. Each comment has the properties feed, id, author, avatar, date, title, content.
    * transmit-comments(post) in response to request-comments where post is an object with the properties feed, id, sub_items, subitems_complete. sub_items has the same format as in transmit-entries.
