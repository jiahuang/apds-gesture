// example for the apds gesture sensor
var tessel = require('tessel');
var GestureLib = require('../');
var gesture = GestureLib.use(tessel.port['A']);

gesture.on('ready', function(){
  console.log("found a gesture sensor");
});

gesture.on('error', function (err){
  console.log("Error: ", err);
});