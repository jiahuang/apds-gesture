// example for the apds gesture sensor
var tessel = require('tessel');
var GestureLib = require('../');
var gesture = GestureLib.use(tessel.port['A']);

gesture.on('ready', function(){
  console.log("found a gesture sensor");
  gesture.setup(function(){
    gesture.enable(function(){
      gesture.readGesture();
    });
  });
});

gesture.on('error', function (err){
  console.log("Error: ", err);
});

gesture.on('movement', function(dir){
  console.log("Sensed movement", dir);
})