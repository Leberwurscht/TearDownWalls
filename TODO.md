first version
=============

* per-identity configuration DONE
* extract templates when connecting DONE
* display login page if no identity known for a site DONE
* normalize profile url DONE
* make crosspost_accounts work DONE
* dialog: make connection to ...<- not displayed DONE
* max-width:100% for images PARTIALLY DONE
* exception when opening dialog DONE
* display like lists DONE
* get_subitems should also return all likes UNTESTED
* fix sub_items_complete in get_items UNTESTED
* show_all not working any more DONE
* like should appear immediately DONE
* click onto like symbol should also add a like DONE
* image embedded in data uri is not shown WORKING
* expert mode (checkbox in configuration): display log, edit config json, queue sizes DONE
* configure accounts DONE
* configure connections DONE
* light addon should allow export of connection file DONE
* like delivery not working, use like_target for export/import, register successful likes DONE
* dialog: hide field if logged in user is equal DONE
* avoid multiple likes DONE
* make inject_after configurable DONE
* cleanup: remove very old posts, remove comments without parents DONE
* crossposting also if you have a friendica account DONE
* api versioning DONE
* create default settings after expert mode set-configuration DONE
* change mouse pointer when crosspost image is hovered
* check if item_store can introduce malformed html
* save everything in database
* fix avatar class
* for (i in ...) -> for (var i in ...)
* cleanup of code
* perhaps: show own posts only if they have at least one comment - how to detect own posts?
* detect language in content script, not extract_templates, to be up to date?
* configuration page on installation, user has to specify he wants to save and extract templates (checkbox), TOS+IP warning
* it is now possible to embed images when posting in facebook, handle them
* execute page worker only on start-worker event, not when browser is opened (get-user is called early enough to generate a template)
* start timeago locale extraction from get_user.js, and only if current lang != <html> lang
* remove support for page workers in configuration.json

try to port to chrome
=====================

...

next versions
=============

* localization
* per facebook group crosspost activation
* perhaps use indexedDB instead of sqlite
* messages
* facebook users should be able to get the feed for a person
* make URLs absolute when processing feeds
* hide like button when commenting and liking is not possible (for feeds)
* crossposted posts appear twice in facebook, combine them. perhaps: try to synchronize comments?
* chat
* comment likes, unlike
* reshare button
* use favicon as avatar for feeds
* order posts by toplevel post date (by last comment is too difficult if there are already posts displayed and more posts are loaded)
	Get oldest native post, keep time order above that. Below, use old approach.
