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
* change mouse pointer when crosspost image is hovered
* check if item_store can introduce malformed html
* save everything in database
* fix avatar class
* crossposting also if you have a friendica account
* cleanup: remove very old posts, remove comments without parents
* api versioning
* for (i in ...) -> for (var i in ...)
* cleanup of code
* perhaps: show own posts only if they have at least one comment
* detect language in content script, not extract_templates, to be up to date?

try to port to chrome
=====================

...

next versions
=============

* localization
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
* order posts by time
