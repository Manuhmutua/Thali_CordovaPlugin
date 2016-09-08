'use strict';

var util = require('util');
var inherits = util.inherits;
var format = util.format;

var assert = require('assert');
var Promise = require('bluebird');

var asserts = require('./utils/asserts.js');
var TestDevice = require('./TestDevice');
var TestFramework = require('./TestFramework');
var unitTestConfig = require('./UnitTestConfig');


function UnitTestFramework(testConfig, logger) {
  var self = this;

  this.logger = logger || console;
  this.unitTestConfig = testConfig.userConfig || unitTestConfig;

  UnitTestFramework.super_.call(this, testConfig, this.unitTestConfig, this.logger);
}

inherits(UnitTestFramework, TestFramework);

UnitTestFramework.prototype.startTests = function (platformName, platform) {
  var self = this;

  assert(platform.success === undefined, 'platform should not be finished');

  asserts.isObject(platform);
  asserts.isString(platformName);

  var devices = platform.devices;
  asserts.isArray(devices);

  var config = this.unitTestConfig[platformName];
  asserts.isObject(config);

  var desigedCount = config.numDevices;
  asserts.isNumber(desigedCount);
  assert(desigedCount > 0, 'we should have at least one device');

  assert(
    devices.length === desigedCount,
    format(
      'we should receive %d devices for platform: \'%s\', but received %d devices instead',
      desigedCount, platformName, devices.length
    )
  );

  devices.forEach(function (device) {
    asserts.instanceOf(device, TestDevice);
  });

  var tests = devices[0].tests;
  devices.slice(1).forEach(function (device) {
    asserts.arrayEquals(tests, device.tests);
  });

  this.logger.debug(
    'Starting unit tests on %d devices, platform: \'%s\'',
    devices.length, platformName
  );

  Promise.all(
    devices.map(function (device) {
      return device.scheduleTests(tests);
    })
  )
  .then(function () {
    return tests.reduce(function (promise, test) {
      return promise.then(function () {
        return self.runTest(devices, test);
      });
    }, Promise.resolve());
  })
  .then(function () {
    platform.success = true;
    self.logger.debug(
      'all unit tests succeed, platform: \'%s\'',
      platformName
    );
  })
  .catch(function (error) {
    platform.success = false;
    self.logger.error(
      'failed to run tests, platform: \'%s\', reason: \'%s\'',
      platformName, error.stack
    );
  })
  .finally(function () {
    return Promise.all(
      devices.map(function (device) {
        return device.complete();
      })
    );
  })
  .finally(function () {
    self.resolveCompleted();
  });
}

UnitTestFramework.prototype.runTest = function (devices, test) {
  return Promise.all(
    devices.map(function (device) {
      return device.setupTest(test)
      .then(function (data) {
        return {
          uuid: device.uuid,
          data: data
        }
      });
    })
  )
  .then(function (devicesData) {
    return Promise.all(
      devices.map(function (device) {
        return device.runTest(test, devicesData);
      })
    );
  })
  .then(function () {
    return Promise.all(
      devices.map(function (device) {
        return device.teardownTest(test);
      })
    );
  });
}

module.exports = UnitTestFramework;
