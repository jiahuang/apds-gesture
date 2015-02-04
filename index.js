var events = require('events');
var util = require('util');
var Queue = require('sync-queue')
var q = new Queue();

var I2C_ADDR = 0x39
  , GESTURE_THRESHOLD_OUT = 20
  , GESTURE_SENSITIVITY = 0.8//0.5
  , ENABLE = 0x80
  , ATIME = 0x81
  , WTIME = 0x83
  , AILTL = 0x84
  , AILTH = 0x85
  , AIHTL = 0x86
  , AIHTH = 0x87
  , PILT = 0x89
  , PIHT = 0x8B
  , PERS = 0x8C
  , CONFIG1 = 0x8D
  , PPULSE = 0x8E
  , CONTROL = 0x8F
  , CONFIG2 = 0x90
  , ID = 0x92
  , STATUS = 0x93
  , CDATAL = 0x94
  , CDATAH = 0x95
  , RDATAL = 0x96
  , RDATAH = 0x97
  , GDATAL = 0x98
  , GDATAH = 0x99
  , BDATAL = 0x9A
  , BDATAH = 0x9B
  , PDATA = 0x9C
  , POFFSET_UR = 0x9D
  , POFFSET_DL = 0x9E
  , CONFIG3 = 0x9F
  , GPENTH = 0xA0
  , GEXTH = 0xA1
  , GCONF1 = 0xA2
  , GCONF2 = 0xA3
  , GOFFSET_U = 0xA4
  , GOFFSET_D = 0xA5
  , GOFFSET_L = 0xA7
  , GOFFSET_R = 0xA9
  , GPULSE = 0xA6
  , GCONF3 = 0xAA
  , GCONF4 = 0xAB
  , GFLVL = 0xAE
  , GSTATUS = 0xAF
  , IFORCE = 0xE4
  , PICLEAR = 0xE5
  , CICLEAR = 0xE6
  , AICLEAR = 0xE7
  , GFIFO_U = 0xFC
  , GFIFO_D = 0xFD
  , GFIFO_L = 0xFE
  , GFIFO_R = 0xFF
  , ID_RES = 0xAB
  ;

// bits on the enable register
var ENABLE_GEN = 6 // gesture enable
  , ENABLE_PIEN = 5 // proximity interrupt enable
  , ENABLE_AIEN = 4 // ALS interrupt enable
  , ENABLE_WEN = 3 // wait enable. 1 = activates wait timer
  , ENABLE_PEN = 2 // proximity detect enable
  , ENABLE_AEN = 1 // ALS enable
  , ENABLE_PON = 0 // Power on. 0 = low power state
  ;

function GestureSensor (hardware) {
  this.hardware = hardware;
  this.i2c = this.hardware.I2C(I2C_ADDR);
  var self = this;
  this._readRegister([ID], 1, function(err, data){
    if (data[0] != ID_RES) {
      self.emit('error', new Error('Cannot connect APDS Gesture sensor. Got id: ' + data[0].toString(16)));
    } else {
      self.fifoData = {};

      self.emit('ready');
    }
  });
}

util.inherits(GestureSensor, events.EventEmitter);

GestureSensor.prototype._readRegister = function (data, num, next) {
  this.i2c.transfer(new Buffer(data), num, next);
};

GestureSensor.prototype._writeRegister = function (data, next) {
  this.i2c.send(new Buffer(data), next);
};

// set up gesture control
GestureSensor.prototype.setup = function(callback) {
  var self = this;
  // turns off everything. need to do this before changing control registers
  this._writeRegister([ENABLE, 0x00], function(){
    q.clear();

    // set enter threshold
    q.place(function(){
      self._writeRegister([GPENTH, 40], q.next);
    });

    // set exit threshold
    q.place(function(){
      self._writeRegister([GEXTH, 30], q.next);
    });

    // set gconf1 (fifo threshold, exit mask, exit persistance)
    q.place(function(){
      self._writeRegister([GCONF1, 0x40], q.next);
    });

    // set gain, led, & wait time
    // 2.8ms wait time  = 1 [2:0]
    // 100mA led drive strength = 0 [4:3]
    // 4x gain = 2 [6:5]
    // 1000001 = 0x41
    q.place(function(){
      self._writeRegister([GCONF2, 0x41], q.next);
    });

    // set gpulse (pulse count & length)
    q.place(function(){
      self._writeRegister([GPULSE, 0xC9], q.next);
    });

    // callback setup
    q.place(function(){
      self.enable(callback);
    });

  });
}

GestureSensor.prototype.enable = function(callback){
  var self = this;
  q.clear();
  // 0.03s low power wait mode
  q.place(function(){
    self._writeRegister([WTIME, 0xFF], q.next);
  });

  // ppulse, set pulse count to 0x89, 16us length 10pulses
  q.place(function(){
    self._writeRegister([WTIME, 0x89], q.next);
  });

  // enter gesture mode
  q.place(function(){
    self._writeRegister([GCONF4, 0x01], q.next);
  });

  q.place(function(){
    self.resetGesture();
    self._writeRegister([ENABLE, 0x4D], callback);
  });

}

GestureSensor.prototype.processGesture = function(length, callback){
  var self = this;
  var start = 0;
  var end = 0;

  // get first and last values above threshold
  for(var i = 0; i<length; i++){


    if (self.fifoData['up'][i] > GESTURE_THRESHOLD_OUT
      && self.fifoData['down'][i] > GESTURE_THRESHOLD_OUT
      && self.fifoData['left'][i] > GESTURE_THRESHOLD_OUT
      && self.fifoData['right'][i] > GESTURE_THRESHOLD_OUT) {

      if (start == 0){
        start = i;
      }

      if (i == (length - 1) || start != 0) {
        end = i;
      }
    }
     
  }

  if (start == 0 || end == 0) {
    // if either is 0 then no values passed threshold
    return callback();
  }

  // get the ratios
  var ud_first = (self.fifoData['up'][start] - self.fifoData['down'][start])/(self.fifoData['up'][start] + self.fifoData['down'][start]);
  var lr_first = (self.fifoData['left'][start] - self.fifoData['right'][start])/(self.fifoData['left'][start] + self.fifoData['right'][start]);
  var ud_last = (self.fifoData['up'][end] - self.fifoData['down'][end])/(self.fifoData['up'][end] + self.fifoData['down'][end]);
  var lr_last = (self.fifoData['left'][end] - self.fifoData['right'][end])/(self.fifoData['left'][end] + self.fifoData['right'][end]);

  // difference between ratios
  var ud_diff = ud_last - ud_first;
  var lr_diff = lr_last - lr_first;

  self.gesture_ud_diff = self.gesture_ud_diff + ud_diff;
  self.gesture_lr_diff = self.gesture_lr_diff + lr_diff;

  self.dir = {'up': 0, 'left': 0};

  if (self.gesture_ud_diff >= GESTURE_SENSITIVITY) {
    self.dir['up'] = -1;
  } else if (self.gesture_ud_diff <= -GESTURE_SENSITIVITY){
    self.dir['up'] = 1;
  } 

  if (self.gesture_lr_diff >= GESTURE_SENSITIVITY){
    self.dir['left'] = -1;

  } else if (self.gesture_lr_diff <= -GESTURE_SENSITIVITY){
    self.dir['left'] = 1;
  }

  if (self.dir['up'] == -1 && self.dir['left'] == 0 ) {
    self.resetGesture();
    self.emit('movement', 'down');
  } else if (self.dir['up'] == 1 && self.dir['left'] == 0 ) {
    self.resetGesture();
    self.emit('movement', 'up');
  } else if (self.dir['up'] == 0 && self.dir['left'] == -1 ) {
    self.resetGesture();
    self.emit('movement', 'right');
  } else if (self.dir['up'] == 0 && self.dir['left'] == 1 ) {
    self.resetGesture();
    self.emit('movement', 'left');
  }
  
  callback();
}

GestureSensor.prototype.resetGesture = function(){
  this.gesture_ud_diff = 0;
  this.gesture_lr_diff = 0;
}

GestureSensor.prototype.readGesture = function(){
  var self = this;
  self.fifoData = {};
  self.fifoData['up'] = [];
  self.fifoData['down'] = [];
  self.fifoData['left'] = [];
  self.fifoData['right'] = [];

  q.clear();
  // check the status to see if there is anything
  self._readRegister([GSTATUS], 1, function(err, data){
    // console.log("reading gstatus", data);
    if (data[0] && 1) {
      var fifoLength = 0;
      // we have valid fifo data
      q.place(function(){
        self._readRegister([GFLVL], 1, function(err, data){
          fifoLength = data[0];
          if (self.debug) {
            console.log("valid fifo length of", fifoLength);
          }
          q.next();
        })
      })

      q.place(function(){
        self._readRegister([GFIFO_U], fifoLength*4, function(err, data){
          for(var i = 0; i<(fifoLength*4); i = i+4){
            self.fifoData['up'].push(data[i]);
            self.fifoData['down'].push(data[i+1]);
            self.fifoData['left'].push(data[i+2]);
            self.fifoData['right'].push(data[i+3]);
          }
          q.next();
        });
      });

      q.place(function(){
        // restart the process
        self.processGesture(fifoLength, function(){
          self.readGesture();
        });
      });
    } else {
      self.readGesture();
    }
  })
}

// exports
exports.GestureSensor = GestureSensor;

exports.use = function (hardware, opts) {
  GESTURE_THRESHOLD_OUT = opts.threshold ? opts.threshold : 20;
  GESTURE_SENSITIVITY = opts.sensitivity ? opts.sensitivity : 0.8;
  return new GestureSensor(hardware);
};