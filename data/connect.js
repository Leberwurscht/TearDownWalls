self.port.on("list-sites", function(sites) {
  list(jQuery("#accounts"), sites, true);
});
