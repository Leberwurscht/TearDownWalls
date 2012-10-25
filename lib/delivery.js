var Lib = require("./lib");
var Database = require("./database");

// This function gets all queued items from the database and tries to deliver them.
function deliver(connections) {
  Database.get_deliver(function(entries) { // TODO: give up after a certain number of attempts in a large enough range of time
    console.log("Trying to deliver "+entries.length+" items");

    for (var i=0; i<entries.length; i++) {
      var entry = entries[i];
      var connection = entry.target;
      var config = connections[connection].target;
      if (!config) continue;

      var variables = {
        "title": entry.title ? entry.title : '',
        "body": entry.content ? entry.content : '',
        "in_reply_to": entry.in_reply_to ? entry.in_reply_to : ''
      };

      Lib.custom_request(config, variables, function(response) {
        if (200<=response.status && response.status<300) {
          var successful = true;
        }
        else {
          var successful = false;
        }

        Database.register_delivery_attempt(entry.id, successful);
      });
    }
  });

  Database.get_deliver_like(function(likes) { // TODO: give up after a certain number of attempts in a large enough range of time
    console.log("Trying to deliver "+likes.length+" likes");

    for (var i=0; i<likes.length; i++) {
      var like = likes[i];
      var connection = like.target;
      var config = connections[connection].like_target;
      if (!config) continue;

      var variables = {
        "in_reply_to": like.in_reply_to
      };

      Lib.custom_request(config, variables, function(response) {
        if (200<=response.status && response.status<300) {
          var successful = true;
        }
        else {
          var successful = false;
        }

        Database.register_delivery_attempt(like.id, successful, true);
      });
    }
  });
}

exports.deliver = deliver;
