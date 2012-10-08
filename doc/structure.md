Structure of TearDownWalls
==========================

Overview
--------

* Posts are stored in a sqlite database which is managed by lib/database.js
* The content scripts for a walled garden are stored in the directory data/sites/SITE_NAME/, which must also contain a file called configuration.json. This file lists the page mods and page workers and references the respective content scripts.
* data/sites/index.json must list all SITE_NAMEs
* Posts are collected by polling atom feeds. This is done by data/parse_atom.js

Configuration
-------------

* Configuration consists of two lists: The accounts list and the connections list.
* Accounts are identified by both a site identifiers and an account identifier, e.g. accounts['facebook'].configuration['http://www.facebook.com/john.doe']. A site identifier is the name of a walled garden social networking site; supported ones are listed in sites.json. The profile URL of a specific account on such a site is normalized and used as account identifier. For each account, the profile URL, account name, avatar and a list of associaten connections is saved. Additionally, content scripts can save and read custom data per account and per site.
* A connection is a bundle of a feed and a crossposting target, so that you can send and receive messages. Currently, only feeds in the atom format are supported. A connection can be used for multiple accounts.

storage.accounts = {
	"facebook": {
		configuration: {
			"john.doe": {
				connections: [...],
				url: "http://www.facebook.com/john.doe"
				name:
				avatar:
			}
		},
		account_data: {
			"john.doe": {...}
		},
		site_data: {...}
	}
}
storage.connections = {
	next_id: 1,
	0:{
		target: {...}
		feed: {...}
	}
}


Interface between main code and content scripts
-----------------------------------------------

* per-site and per-account data is available in content script under self.options.site_data and self.options.account_data
* self.option.crosspost_accounts is a list of accounts for which a crossposting target is configured. Can be used to show/hide a crosspost button.
* self.options.exposed can be used to access files under the data/sites/SITE_NAME/ folder
* The page mods and page workers (as listed in data/sites/SITE_NAME/configuration.json) for a specific walled garden communicate with lib/main.js over a well-defined interface by exchanging messages.
    * In content scripts, self.options.data and self.options.exposed is defined, where self.options.exposed contains the resource URLs of the files given by the expose property in configuration.js.
    * The content scripts may send the following messages:
        * request-posts(account, posts, comments, start_date) requests the 'posts' newest toplevel posts, each with the 'comments' most recent comments, that are newer than start_date. 'account' is the account identifier for which we want to get the posts.
        * request-comments(connection, id, max_comments) requests the 'max_comments' newest comments for a post specified by connection and post id
        * send-item(account, item) where item has properties title, content, and optionally both in_reply_to and feed: sent when a post was composed within the walled garden which should also be sent to the federated social web
        * like-item(item_id, connections) to send a like
        * set-data(data, account) can be used if the content scripts need to store data. account may be null for data that is not account-specific (e.g. templates).
        * request-data(account) re-requests the stored data. data is also made available to content scripts over self.options.data, but might be out of date (?). account may be null.
        * log(message, level) can be used to log errors.
        * start-worker(config) can be used to start a page worker. Format of config object is as in configuration.json.
        * terminate() tells the main code to destroy the content script.
    * The content script may or should react to the following messages - and page mod scripts should not do anything until they receive one of them (necessary to work around https://bugzilla.mozilla.org/show_bug.cgi?id=777632):
	* log-out(). Content script should log out the currently logged in user.
        * start(). The content script should get the currently logged in user (like get-user), setup crossposting, and inject posts.
        * transmit-data(data, account) in response to request-data; transmits the data that was set using set-data earlier. account may be null.
        * transmit-posts(posts) in response to request-posts where posts is an array of toplevel posts. Each toplevel post has the properties feed, id, author, avatar, date, title, content, sub_items, sub_items_complete. sub_items is an array of comments. Each comment has the properties feed, id, author, avatar, date, title, content.
        * transmit-comments(post) in response to request-comments where post is an object with the properties feed, id, sub_items, subitems_complete. sub_items has the same format as in transmit-items.
* configuration.json must include
	* configuration for a page worker 'get_user', which must emit a logged-in(account_identifier, url, avatar, name) message in response to a get-user() message. Additionally, the page worker is supplied with the same interface as described above.
	* configuration for a page mod 'relogin', which must log out the user on a log-out() message, redirect to a login form on a redirect() message, and must emit a logged-in(account_identifier, url, avatar, name) message in response to a get-user() message. Additionally, the page mod is supplied with the same interface as described above(TODO).
