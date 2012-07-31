Structure of TearDownWalls
==========================

* Posts are stored in a sqlite database which is managed by lib/database.js
* The content scripts for a walled garden are stored in the directory data/sites/SITE_NAME/, which must also contain a file called configuration.json. This file lists the page mods and page workers and references the respective content scripts.
* data/sites/index.json must list all SITE_NAMEs
* Posts are collected by polling atom feeds. This is done by data/parse_atom.js
* The page mods and page workers for a specific walled garden communicate with lib/main.js over a well-defined interface by exchanging messages.
    * The content scripts may send the following messages:
        * request-posts(posts, comments, start_date) requests the 'posts' newest toplevel posts, each with the 'comments' most recent comments, that are newer than start_date.
        * request-comments(feed, id, max_comments) requests the 'max_comments' newest comments for a post specified by feed and id
        * send-item(item) where item has properties title, content, in_reply_to: sent when a post was composed within the walled garden which should also be sent to the federated social web
        * set-data(data) can be used if the content scripts need to store data.
        * request-data() re-requests the stored data. data is also made available to content scripts over self.options, but might be out of date (?)
        * log(message, level) can be used to log errors.
        * start-worker(config) can be used to start a page worker. Format of config object is as in configuration.json.
    * The content script may react to the following messages:
        * transmit-data(data)  in response to request-data; transmits the data that was set using set-data earlier.
        * transmit-posts(posts) in response to request-posts where posts is an array of toplevel posts. Each toplevel post has the properties feed, id, author, avatar, date, title, content, sub_items, sub_items_complete. sub_items is an array of comments. Each comment has the properties feed, id, author, avatar, date, title, content.
        * transmit-comments(post) in response to request-comments where post is an object with the properties feed, id, sub_items, subitems_complete. sub_items has the same format as in transmit-items.
