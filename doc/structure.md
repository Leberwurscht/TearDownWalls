Structure of TearDownWalls
==========================

* Posts are stored in a sqlite database which is managed by lib/database.js
* The content scripts for a walled garden are stored in the directory data/sites/SITE_NAME/, which must also contain a file called configuration.json. This file lists the page mods and page workers and references the respective content scripts.
* data/sites/index.json must list all SITE_NAMEs
* Posts are collected by polling atom feeds. This is done by data/parse_atom.js
* The page mods and page workers for a specific walled garden communicate with lib/main.js over a well-defined interface by exchanging messages.
    * In content scripts, self.options.data and self.options.exposed is defined, where self.options.exposed contains the resource URLs of the files given by the expose property in configuration.js.
    * The content scripts may send the following messages:
	* logged-in(profile_url, avatar_url, name) should be sent if a user is logged in
        * request-posts(posts, comments, start_date) requests the 'posts' newest toplevel posts, each with the 'comments' most recent comments, that are newer than start_date.
        * request-comments(feed, id, max_comments) requests the 'max_comments' newest comments for a post specified by feed and id
        * send-item(item) where item has properties title, content, and optionally both in_reply_to and feed: sent when a post was composed within the walled garden which should also be sent to the federated social web
        * set-data(data) can be used if the content scripts need to store data.
        * request-data() re-requests the stored data. data is also made available to content scripts over self.options.data, but might be out of date (?)
        * log(message, level) can be used to log errors.
        * start-worker(config) can be used to start a page worker. Format of config object is as in configuration.json.
        * terminate() tells the main code to destroy the content script.
    * The content script may or should react to the following messages:
        * start(is_tab). The content script should not do anything until it receives this message. is_tab indicates whether the script is run inside a tab (as opposed to a page worker) and can be used as a workaround until https://bugzilla.mozilla.org/show_bug.cgi?id=777632 is fixed in a stable release of the addon builder.
	* log-out(). Logs out the currently logged in user. Either this message or start is received.
        * transmit-data(data) in response to request-data; transmits the data that was set using set-data earlier.
        * transmit-posts(posts) in response to request-posts where posts is an array of toplevel posts. Each toplevel post has the properties feed, id, author, avatar, date, title, content, sub_items, sub_items_complete. sub_items is an array of comments. Each comment has the properties feed, id, author, avatar, date, title, content.
        * transmit-comments(post) in response to request-comments where post is an object with the properties feed, id, sub_items, subitems_complete. sub_items has the same format as in transmit-items.
