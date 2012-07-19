jQuery("#form").submit(function(){
	self.port.emit("connect", jQuery("#url").val());
});
