#APDS Gesture control driver

Example usage:

```js
// example for the apds gesture sensor
var tessel = require('tessel');
var GestureLib = require('../');
var G_THRESHOLD = 15
  , G_SENSITIVITY = 0.5//0.5
  ;

var gesture = GestureLib.use(tessel.port['A'], 
	{'threshold': G_THRESHOLD, 'sensitivity': G_SENSITIVITY});

gesture.debug = true;

gesture.on('ready', function(){
  console.log("found a gesture sensor");
  gesture.setup(function(){
     gesture.readGesture();
  });
});

gesture.on('movement', function(dir){
  console.log("Sensed movement", dir);
});

gesture.on('error', function (err){
  console.log("Error: ", err);
});
```
