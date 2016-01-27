'use strict';

var ThaliWifiInfrastructure = require('thali/NextGeneration/thaliWifiInfrastructure');
var tape = require('../lib/thali-tape');
var nodessdp = require('node-ssdp');
var express = require('express');
var http = require('http');
var net = require('net');
var uuid = require('node-uuid');

var THALI_NT = 'http://www.thaliproject.org/ssdp';

var wifiInfrastructure = new ThaliWifiInfrastructure();

var test = tape({
  setup: function(t) {
    wifiInfrastructure.start(express.Router()).then(function () {
      t.end();
    });
  },
  teardown: function(t) {
    // Stop everything at the end of tests to make sure
    // the next test starts from clean state
    wifiInfrastructure.stop().then(function () {
      t.end();
    });
  }
});

test('#startListeningForAdvertisements should emit wifiPeerAvailabilityChanged after test peer becomes available', function (t) {
  var testHostAddress = 'foo.bar';
  var testPort = 8080;
  var testLocation = 'http://' + testHostAddress + ':' + testPort;
  var testServer = new nodessdp.Server({
    location: testLocation,
    udn: THALI_NT
  });
  testServer.setUSN('urn:uuid:' + uuid.v4());
  var wifiPeerAvailabilityChangedListener = function (data) {
    var peer = data[0];
    t.equal(peer.hostAddress, testHostAddress, 'host address should match');
    t.equal(peer.portNumber, testPort, 'port should match');
    wifiInfrastructure.removeListener('wifiPeerAvailabilityChanged', wifiPeerAvailabilityChangedListener);
    testServer.stop(function () {
      t.end();
    });
  };
  wifiInfrastructure.on('wifiPeerAvailabilityChanged', wifiPeerAvailabilityChangedListener);
  testServer.start(function () {
    wifiInfrastructure.startListeningForAdvertisements();
  });
});

test('#startUpdateAdvertisingAndListening should use different USN after every invocation', function (t) {
  var testClient = new nodessdp.Client();

  var firstUSN = null;
  testClient.on('advertise-alive', function (data) {
    // Check for the Thali NT in case there is some other
    // SSDP traffic in the network.
    if (data.NT === THALI_NT) {
      if (firstUSN !== null) {
        t.notEqual(firstUSN, data.USN, 'USN should have changed from the first one');
        testClient.stop(function () {
          t.end();
        });
      } else {
        firstUSN = data.USN;
        // This is the second call to the update function and after
        // this call, the USN value should have been changed.
        wifiInfrastructure.startUpdateAdvertisingAndListening();
      }
    }
  });

  testClient.start(function () {
    // This is the first call to the update function after which
    // some USN value should be advertised.
    wifiInfrastructure.startUpdateAdvertisingAndListening();
  });
});

test('messages with invalid location or USN should be ignored', function (t) {
  var testMessage = {
    NT: THALI_NT,
    USN: uuid.v4(),
    LOCATION: 'http://foo.bar:90000'
  };
  var handledMessage = wifiInfrastructure._handleMessage(testMessage, true);
  t.equals(handledMessage, false, 'should not have emitted with invalid port');
  testMessage.USN = '';
  testMessage.LOCATION = 'http://foo.bar:50000';
  handledMessage = wifiInfrastructure._handleMessage(testMessage, true);
  t.equals(handledMessage, false, 'should not have emitted with invalid USN');
  t.end();
});

test('verify that Thali-specific messages are filtered correctly', function (t) {
  var irrelevantMessage = {
    NT: 'foobar'
  };
  t.equal(true, wifiInfrastructure._shouldBeIgnored(irrelevantMessage), 'irrelevant messages should be ignored');
  var relevantMessage = {
    NT: THALI_NT,
    USN: uuid.v4()
  };
  t.equal(false, wifiInfrastructure._shouldBeIgnored(relevantMessage), 'relevant messages should not be ignored');
  var messageFromSelf = {
    NT: THALI_NT,
    USN: wifiInfrastructure.usn
  };
  t.equal(true, wifiInfrastructure._shouldBeIgnored(messageFromSelf), 'messages from this device should be ignored');
  t.end();
});

test('#start should fail if called twice in a row', function (t) {
  // The start here is already the second since it is being
  // done once in the setup phase
  wifiInfrastructure.start(express.Router())
  .catch(function (error) {
    t.equal(error.message, 'Call Stop!', 'specific error should be received');
    t.end();
  });
});

test('#startUpdateAdvertisingAndListening should fail invalid router has been passed', function (t) {
  wifiInfrastructure.stop()
  .then(function () {
    return wifiInfrastructure.start('invalid router object');
  })
  .then(function () {
    return wifiInfrastructure.startUpdateAdvertisingAndListening();
  })
  .catch(function (error) {
    t.equal(error.message, 'Bad Router', 'specific error should be received');
    t.end();
  });
});

test('#startUpdateAdvertisingAndListening should fail if router server starting fails', function (t) {
  // Save the old port so that it can be reassigned after the test.
  var oldPort = wifiInfrastructure.port;
  // Create a test server that is used to block the port
  // onto which the router server is tried to be started.
  var testServer = net.createServer(function (c) {
    // NOOP
  });
  testServer.listen(0, function () {
    var testServerPort = testServer.address().port;
    // Set the port to be the same on which we already
    // have our test server running. This should
    // create a failure when trying to start the router
    // server on the same port.
    wifiInfrastructure.port = testServerPort;
    wifiInfrastructure.startUpdateAdvertisingAndListening()
    .catch(function (error) {
      t.equals(error.message, 'Unspecified Error with Radio infrastructure', 'specific error expected');
      wifiInfrastructure.port = oldPort;
      testServer.close(function () {
        t.end()
      });
    });
  });
});

test('#startUpdateAdvertisingAndListening should start hosting given router object', function (t) {
  var router = express.Router();
  var testPath = '/test';
  router.get(testPath, function (req, res) {
    res.send('foobar');
  });
  wifiInfrastructure.stop()
  .then(function () {
    return wifiInfrastructure.start(router);
  })
  .then(function () {
    return wifiInfrastructure.startUpdateAdvertisingAndListening();
  })
  .then(function () {
    http.get({
      path: testPath,
      port: wifiInfrastructure.port,
      agent: false // to prevent connection keep-alive
    }, function (res) {
      t.equal(res.statusCode, 200, 'server should respond with code 200');
      t.end();
    });
  });
});

test('#stop can be called multiple times in a row', function (t) {
  wifiInfrastructure.stop()
  .then(function () {
    t.equal(wifiInfrastructure.started, false, 'should be in stopped state');
    return wifiInfrastructure.stop();
  })
  .then(function () {
    t.equal(wifiInfrastructure.started, false, 'should still be in stopped state');
    t.end();
  });
});
