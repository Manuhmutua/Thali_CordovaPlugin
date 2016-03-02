'use strict';
var tape = require('../lib/thali-tape');
var crypto = require('crypto');
var sinon = require('sinon');

var PeerDictionary =
  require('thali/NextGeneration/notification/thaliPeerDictionary');
var ThaliNotificationAction =
  require('thali/NextGeneration/notification/thaliNotificationAction');
var ThaliMobile =
  require('thali/NextGeneration/thaliMobile');

var SECP256K1 = 'secp256k1';

var ENTRY1 = 'entry1';
var ENTRY2 = 'entry2';


var test = tape({
  setup: function (t) {
    t.end();
  },
  teardown: function (t) {
    t.end();
  }
});

function createEntry(name, state) {

  var myPublicKey = crypto.createECDH(SECP256K1);

  myPublicKey.generateKeys();

  var act = new ThaliNotificationAction(name,
    ThaliMobile.connectionTypes.BLUETOOTH, myPublicKey, function () { });

  var peerConnInfo =
    new PeerDictionary.PeerConnectionInformation('127.0.0.1', 3001, 10);

  return new PeerDictionary.NotificationPeerDictionaryEntry(
    state, peerConnInfo, act );
}
/**
 * Adds a series of entries to the dictionary object.
 *
 * @param {module:thaliPeerDictionary.PeerDictionary} dictionary An
 * incoming peer dictionary.
 * @param {string} baseString The prefix for each entry name.
 * @param {module:thaliPeerDictionary.peerState} state
 * @param {number} count The number of entries that will be created.
 */
function addEntries(dictionary, baseString, state, count) {
  for (var i = 0 ; i < count ; i++) {
    var entry = createEntry(baseString + i, state);
    dictionary.addUpdateEntry(baseString + i, entry);
  }
}

/**
 * Verifies that a series of entries exists in the dictionary.
 * @param {module:thaliPeerDictionary.PeerDictionary} dictionary
 * @param {string} baseString prefix
 * @param {number} start counter start
 * @param {number} end counter end
 */
function verifyEntriesExists(dictionary, baseString, start, end) {
  var exists = true;

  for (var i = start ; i < end ; i++) {
    if (!dictionary.exists(baseString+i)) {
      exists = false;
      break;
    }
  }
  return exists;
}

test('Test PeerConnectionInformation basics', function (t) {

  var connInfo = new PeerDictionary.PeerConnectionInformation(
    '127.0.0.1', 123, 10);

  t.equals( connInfo.getHostAddress(),
    '127.0.0.1', 'getHostAddress works');

  t.equals( connInfo.getPortNumber(),
    123, 'getPortNumber works');

  t.equals( connInfo.getSuggestedTCPTimeout(),
    10, 'getSuggestedTCPTimeout works');

  t.end();
});

test('Test PeerDictionary basic functionality', function (t) {
  var dictionary = new PeerDictionary.PeerDictionary();

  var entry1 = createEntry(ENTRY1, PeerDictionary.peerState.RESOLVED);
  var entry2 = createEntry(ENTRY2, PeerDictionary.peerState.RESOLVED);

  dictionary.addUpdateEntry(ENTRY1, entry1);
  t.equal(dictionary._entryCounter, 1, 'Entry counter must be 1');

  dictionary.addUpdateEntry(ENTRY2, entry2);
  t.equal(dictionary._entryCounter, 2, 'Entry counter must be 2');

  t.ok(dictionary.get('entry1'), 'Entry should be found');

  dictionary.remove(ENTRY2);
  t.equal(dictionary.size(), 1, 'Size must be 1');

  dictionary.remove(ENTRY1);
  t.equal(dictionary.size(), 0, 'Size must be 0');

  t.end();
});

test('Test PeerDictionary with multiple entries.', function (t) {

  // Tests that the dictionary size remains always under
  // PeerDictionary.PeerDictionary.MAXSIZE
  var dictionary = new PeerDictionary.PeerDictionary();

  addEntries(dictionary, 'resolved_', PeerDictionary.peerState.RESOLVED,
    PeerDictionary.PeerDictionary.MAXSIZE + 20 );

  t.equal(dictionary.size(), PeerDictionary.PeerDictionary.MAXSIZE,
    'Size must be'+ PeerDictionary.PeerDictionary.MAXSIZE);

  // Tests that the newest entries remained (entries 20 - MAXSIZE+20)
  var entriesExist = verifyEntriesExists(dictionary, 'resolved_', 20,
    PeerDictionary.PeerDictionary.MAXSIZE + 20);

  t.equal(entriesExist, true,
    'Entries between 20 and MAXSIZE + 20 should exist');

  var dictionary2 = new PeerDictionary.PeerDictionary();

  var entryWaiting = createEntry(ENTRY1, PeerDictionary.peerState.WAITING);
  dictionary2.addUpdateEntry(ENTRY1, entryWaiting);

  addEntries(dictionary2, 'resolved_', PeerDictionary.peerState.RESOLVED,
    PeerDictionary.PeerDictionary.MAXSIZE + 20 );

  var entry = dictionary2.get(ENTRY1);

  t.ok(entry != null, 'WAITING state entry should not be removed');

  t.end();
});

test('RESOLVED entries are removed before WAITING state entry.', function (t) {

  var dictionary = new PeerDictionary.PeerDictionary();

  var entryWaiting = createEntry(ENTRY1, PeerDictionary.peerState.WAITING);
  dictionary.addUpdateEntry(ENTRY1, entryWaiting);

  addEntries(dictionary, 'resolved_', PeerDictionary.peerState.RESOLVED,
    PeerDictionary.PeerDictionary.MAXSIZE + 5 );

  var entry = dictionary.get(ENTRY1);

  t.ok(entry != null, 'WAITING state entry should not be removed');

  t.end();
});

test('WAITING entries are removed before CONTROLLED_BY_POOL state entry.',
  function (t) {
    var dictionary = new PeerDictionary.PeerDictionary();

    var entryControlledByPool = createEntry(ENTRY1,
      PeerDictionary.peerState.CONTROLLED_BY_POOL);

    dictionary.addUpdateEntry(ENTRY1, entryControlledByPool);

    addEntries(dictionary, 'waiting_', PeerDictionary.peerState.RESOLVED,
      PeerDictionary.PeerDictionary.MAXSIZE + 5 );

    var entry = dictionary.get(ENTRY1);

    t.ok(entry != null, 'WAITING state entry should not be removed');

    t.end();
  });

test('When CONTROLLED_BY_POOL entry is removed kill is called.', function (t) {

  var dictionary = new PeerDictionary.PeerDictionary();

  var entryControlledByPool = createEntry(ENTRY1,
    PeerDictionary.peerState.CONTROLLED_BY_POOL);

  dictionary.addUpdateEntry(ENTRY1, entryControlledByPool);

  var spyKill =
    sinon.spy(entryControlledByPool.notificationAction, 'kill');

  addEntries(dictionary, 'waiting_',
    PeerDictionary.peerState.CONTROLLED_BY_POOL,
    PeerDictionary.PeerDictionary.MAXSIZE + 5 );

  t.equals(spyKill.callCount,
    1, 'Kill should be called once');

  t.end();
});



