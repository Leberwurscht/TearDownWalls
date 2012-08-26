// load necessary XPCOM objects to be able to use sqlite
var {Cc, Ci, Cu} = require("chrome");
var {Services} = Cu.import("resource://gre/modules/Services.jsm");
var {FileUtils} = Cu.import("resource://gre/modules/FileUtils.jsm");

// open database
var database_file = FileUtils.getFile("ProfD", ["TearDownWalls.sqlite"]);
var connection = Services.storage.openDatabase(database_file);

// create tables and indices if it they do not exist
connection.createAsyncStatement("CREATE TABLE IF NOT EXISTS items (feed INTEGER, id TEXT, date INTEGER, author_name TEXT, avatar_url TEXT, in_reply_to TEXT, title TEXT, content TEXT)").executeAsync();
connection.createAsyncStatement("CREATE TABLE IF NOT EXISTS delivery (target INTEGER, in_reply_to TEXT, title TEXT, content TEXT, last_try INTEGER, tries INTEGER)").executeAsync();
connection.createAsyncStatement("CREATE TABLE IF NOT EXISTS log (site_identifier TEXT, date INTEGER, message TEXT, level INTEGER)").executeAsync();

connection.createAsyncStatement("CREATE INDEX IF NOT EXISTS id_idx ON items (feed, id)").executeAsync();
connection.createAsyncStatement("CREATE INDEX IF NOT EXISTS in_reply_to_idx ON items (feed, in_reply_to)").executeAsync();
connection.createAsyncStatement("CREATE INDEX IF NOT EXISTS date_idx ON items (feed, date DESC)").executeAsync(); // TODO: better indices

function add_items(feed, items) {
  // format of items paramenter: {"id1":item1, ...} where item1 is null or an object with attributes author, avatar, in_reply_to, date, title, content

  // create SQL statements
  var toplevel_delete_statement = connection.createStatement("DELETE FROM items WHERE feed=:feed AND (id=:id OR in_reply_to=:id)"); // delete whole top level items
  var toplevel_delete_params = toplevel_delete_statement.newBindingParamsArray();

  var delete_statement = connection.createStatement("DELETE FROM items WHERE feed=:feed AND id=:id"); // delete single items
  var delete_params = delete_statement.newBindingParamsArray();

  var insert_statement = connection.createStatement("INSERT INTO items (feed, id, date, author_name, avatar_url, in_reply_to, title, content) VALUES (:feed, :id, :date, :author_name, :avatar_url, :in_reply_to, :title, :content)");
  var insert_params = insert_statement.newBindingParamsArray();

  for (id in items) {
    if (!items.hasOwnProperty(id)) continue;
    var item = items[id];

    // delete (old) item
    if (item) var params = delete_params;
    else var params = toplevel_delete_params;

    var row_params = params.newBindingParams();
    row_params.bindByName("feed", feed);
    row_params.bindByName("id", id);
    params.addParams(row_params);

    if (item) { // insert new item
      var row_params = insert_params.newBindingParams();
      row_params.bindByName("feed", feed);
      row_params.bindByName("id", id);
      row_params.bindByName("author_name", item.author);
      row_params.bindByName("avatar_url", item.avatar);
      row_params.bindByName("in_reply_to", item.in_reply_to ? item.in_reply_to : null);
      row_params.bindByName("date", item.date);
      row_params.bindByName("title", item.title);
      row_params.bindByName("content", item.content);
      insert_params.addParams(row_params);
    }
  }

  // execute statements
  console.log("feed "+feed+": toplevel delete "+toplevel_delete_params.length);
  if (toplevel_delete_params.length) {
    toplevel_delete_statement.bindParameters(toplevel_delete_params);
    toplevel_delete_statement.executeAsync();
  }

  console.log("feed "+feed+":  delete "+delete_params.length);
  if (delete_params.length) {
    delete_statement.bindParameters(delete_params);
    delete_statement.executeAsync();
  }

  console.log("feed "+feed+": insert "+insert_params.length);
  if (insert_params.length) {
    insert_statement.bindParameters(insert_params);
    insert_statement.executeAsync();
  }

}

function get_items(feeds, toplevel_items, sub_items, start_date, items_handler) {
  var items = [];
  var items_index = {};

  // build WHERE clause to selected the specified feeds
  if (!feeds) {
    var feeds_where_clause = "";
  }
  else if (!feeds.length) {
    var feeds_where_clause = " AND 0";
  }
  else {
    var feeds_identifiers = [];

    for (var i=0; i<feeds.length; i++) {
      feeds_identifiers.push("feed"+i);
    }

    var feeds_where_clause = " AND feed IN (:";
    feeds_where_clause += feeds_identifiers.join(",:")
    feeds_where_clause += ")"
  }

  // create statement to select toplevel items
  if (start_date===null || start_date===undefined) {
    var toplevel_statement = connection.createStatement("SELECT * FROM items WHERE in_reply_to IS NULL"+feeds_where_clause+" ORDER BY date DESC LIMIT :limit");
  }
  else {
    var toplevel_statement = connection.createStatement("SELECT * FROM items WHERE in_reply_to IS NULL"+feeds_where_clause+" AND date<:date ORDER BY date DESC LIMIT :limit");
    toplevel_statement.params.date = start_date;
  }

  // bind the remaining params
  if (feeds) {
    for (var i=0; i<feeds.length; i++) {
      var identifier = feeds_identifiers[i];
      var feed = feeds[i];

      toplevel_statement.params[identifier] = feed;
    }
  }

  toplevel_statement.params.limit = toplevel_items;

  // create statement to select the subitems for each toplevel item
  var sub_statement = connection.createStatement("SELECT * FROM items WHERE feed=:feed AND in_reply_to=:in_reply_to ORDER BY date DESC LIMIT :limit");
  var sub_params = sub_statement.newBindingParamsArray();

  // execute the queries
  toplevel_statement.executeAsync({
    handleResult: function(aResultSet) {

      var row;
      while (row = aResultSet.getNextRow()) {
        var toplevel_item = {};

        toplevel_item["feed"] = row.getResultByName("feed");
        toplevel_item["id"] = row.getResultByName("id");
        toplevel_item["author"] = row.getResultByName("author_name");
        toplevel_item["avatar"] = row.getResultByName("avatar_url");
        toplevel_item["date"] = row.getResultByName("date");
        toplevel_item["title"] = row.getResultByName("title");
        toplevel_item["content"] = row.getResultByName("content");
        toplevel_item["sub_items"] = [];
        toplevel_item["sub_items_complete"] = true; // default value

        items.push(toplevel_item);
        items_index[toplevel_item["id"]] = toplevel_item;

        var row_params = sub_params.newBindingParams();
        row_params.bindByName("feed", row.getResultByName("feed"));
        row_params.bindByName("in_reply_to", toplevel_item["id"]);
        row_params.bindByName("limit", sub_items+1); // one more than requested to check whether there are more comments
        sub_params.addParams(row_params);
      }

    },

    handleError: function(aError) {
      console.log("Error: " + aError.message);
    },

    handleCompletion: function(aReason) {
      if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
        console.log("Query canceled or aborted!");

      if (sub_params.length) { // TODO: swap out to other function
        sub_statement.bindParameters(sub_params);
        sub_statement.executeAsync({
          handleResult: function (aResultSet) {
            var row;
            while (row = aResultSet.getNextRow()) {
              var sub_item = {};

              sub_item["feed"] = row.getResultByName("feed");
              sub_item["id"] = row.getResultByName("id");
              sub_item["author"] = row.getResultByName("author_name");
              sub_item["avatar"] = row.getResultByName("avatar_url");
              sub_item["date"] = row.getResultByName("date");
              sub_item["title"] = row.getResultByName("title");
              sub_item["content"] = row.getResultByName("content");

              toplevel_item = items_index[row.getResultByName("in_reply_to")];

              if (toplevel_item["sub_items"].length >= sub_items) {
                toplevel_item["sub_items_complete"] = false;
              }
              else {
                toplevel_item["sub_items"].unshift(sub_item);
              }
            }
          },
          handleError: function(){},
          handleCompletion: function(){
            items_handler(items);
          }
        });
      }

    }
  });
}

function get_subitems(feed, id, max_subitems, subitems_handler) {
  if (max_subitems) {
    var sub_statement = connection.createStatement("SELECT * FROM items WHERE feed=:feed AND in_reply_to=:in_reply_to ORDER BY date DESC LIMIT :limit");
    sub_statement.params.limit = max_subitems+1;
  }
  else {
    var sub_statement = connection.createStatement("SELECT * FROM items WHERE feed=:feed AND in_reply_to=:in_reply_to ORDER BY date DESC");
  }

  sub_statement.params.feed = feed;
  sub_statement.params.in_reply_to = id;

  subitems = {
    "feed": feed,
    "id": id,
    "sub_items":[],
    "sub_items_complete":true
  };

  sub_statement.executeAsync({
    handleResult: function (aResultSet) {
      var row;
      while (row = aResultSet.getNextRow()) {
        var sub_item = {};

        sub_item["feed"] = row.getResultByName("feed");
        sub_item["id"] = row.getResultByName("id");
        sub_item["author"] = row.getResultByName("author_name");
        sub_item["avatar"] = row.getResultByName("avatar_url");
        sub_item["date"] = row.getResultByName("date");
        sub_item["title"] = row.getResultByName("title");
        sub_item["content"] = row.getResultByName("content");

        if (max_subitems && (subitems["sub_items"].length >= max_subitems)) {
          subitems["sub_items_complete"] = false;
        }
        else {
          subitems["sub_items"].unshift(sub_item);
        }
      }
    },
    handleError: function(){},
    handleCompletion: function(){
      subitems_handler(subitems);
    }
  });
}

function add_deliver(item, targets) {
  var insert_statement = connection.createStatement("INSERT INTO delivery (target, in_reply_to, title, content, tries) VALUES (:target, :in_reply_to, :title, :content, 0)");

  var params = insert_statement.newBindingParamsArray();

  for (var i=0; i<targets.length; i++) {
    var target = targets[i];

    var row_params = params.newBindingParams();
    row_params.bindByName("target", target);
    row_params.bindByName("in_reply_to", item.in_reply_to ? item.in_reply_to : null);
    row_params.bindByName("title", item.title ? item.title : null);
    row_params.bindByName("content", item.content);
    params.addParams(row_params);
  }

  insert_statement.bindParameters(params);
  insert_statement.executeAsync();
}

function get_deliver(handler) {
  var statement = connection.createStatement("SELECT *, rowid FROM delivery");
  var result = [];

  statement.executeAsync({
    handleResult: function (aResultSet) {
      var row;
      while (row = aResultSet.getNextRow()) {
        var result_row = {};

        result_row["id"] = row.getResultByName("rowid");
        result_row["target"] = row.getResultByName("target");
        result_row["in_reply_to"] = row.getResultByName("in_reply_to");
        result_row["title"] = row.getResultByName("title");
        result_row["content"] = row.getResultByName("content");

        result.push(result_row);
      }
    },
    handleError: function(){},
    handleCompletion: function(){
      handler(result);
    }
  });
}

function register_delivery_attempt(rowid, successful) {
  if (successful) {
    var statement = connection.createStatement("DELETE FROM delivery WHERE rowid=:rowid");
  }
  else {
    var statement = connection.createStatement("UPDATE delivery SET last_try=:last_try, tries=tries+1 WHERE rowid=:rowid");
    statement.params.last_try = Math.round(new Date().getTime() / 1000);
  }

  statement.params.rowid = rowid;

  statement.executeAsync();
}

function log(site_identifier, date, message, level) {
  var statement = connection.createStatement("INSERT INTO log (site_identifier, date, message, level) VALUES (:site_identifier, :date, :message, :level)");
  statement.params.site_identifier = site_identifier;
  statement.params.date = date;
  statement.params.message = message;
  statement.params.level = level;
  statement.executeAsync();
}

exports.get_subitems = get_subitems;
exports.get_items = get_items;
exports.add_items = add_items;

exports.add_deliver = add_deliver;
exports.get_deliver = get_deliver;
exports.register_delivery_attempt = register_delivery_attempt;

exports.log = log;

//exports.cleanup = cleanup; // TODO: remove old items
