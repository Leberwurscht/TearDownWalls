function convert_to_absolute(url){ // http://james.padolsey.com/javascript/getting-a-fully-qualified-url/
  if (typeof url != "string") return url;

  var img = document.createElement('img');
  img.src = url;
  url = img.src;
  img.src = null;
  return url;
}

function common_parent(elements) {
  // works by marking the path upwards from the first element,
  var path_upwards = [];
  var current_element = elements[0];
  while (current_element = current_element.parentNode) {
    path_upwards.push(current_element);
  }

  // and then cutting this path iteratively.
  for (var i=1; i<elements.length; i++) {
    var current_element = elements[i];
    while (current_element = current_element.parentNode) {
      var index = path_upwards.indexOf(current_element);
      if (index != -1) break;
    }
    var parent_element = current_element;

    path_upwards = path_upwards.slice(index);
  }

  // the first element of the remaining path is the nearest common parent
  return path_upwards[0];
}
