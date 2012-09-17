self.port.on("log-out", function() {
  console.log("logging out of facebook");
  jQuery("#logout_form").submit();
});

self.port.on("redirect", function() {
  if (jQuery("#loginform").length) return;
  window.location.href = "https://www.facebook.com/login.php";
});
