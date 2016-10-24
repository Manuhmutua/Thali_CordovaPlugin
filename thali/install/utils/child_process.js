//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

var CHILD_PROCESS = require('child_process');
var Promise = require('./Promise');

function exec(command, options) {
  return new Promise(function (resolve, reject) {
    var childProcess = CHILD_PROCESS.exec(command, options);

    childProcess.stdout.on('data', function (data) {
      console.log('' + data);
    });
    childProcess.stderr.on('data', function (data) {
      console.log('' + data);
    });
    childProcess.on('close', function (code) {
      if (code !== 0) {
        return reject('`' + command + '` (exited with error code' + code + ')');
      }
      return resolve();
    });
  });
}

function spawn(command, options) {
  return new Promise(function (resolve, reject) {
    var commandSplit = command.split(' ');
    var commandOnly = commandSplit.shift();
    console.log('Spawning: ' + commandOnly + ' - ' + commandSplit + ' - ' +
      JSON.stringify(options));
    var commandSpawn = CHILD_PROCESS.spawn(commandOnly, commandSplit, options);

    commandSpawn.stdout.on('data', function (data) {
      console.log('' + data);
    });
    commandSpawn.stderr.on('data', function (data) {
      console.log('' + data);
    });
    commandSpawn.on('close', function (code) {
      if (code !== 0) {
        return reject('`' + command + '` (exited with error code' + code + ')');
      }
      return resolve();
    });
  });
}

module.exports.exec = exec;
module.exports.spawn = spawn;
