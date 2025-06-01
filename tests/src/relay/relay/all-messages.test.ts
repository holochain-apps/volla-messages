import { assert, test } from "vitest";

import { runScenario, dhtSync, CallableCell } from '@holochain/tryorama';
import {
  NewEntryAction,
  ActionHash,
  Record,
  Link,
  AppBundleSource,
  fakeActionHash,
  fakeAgentPubKey,
  fakeEntryHash
} from '@holochain/client';
import { decode } from '@msgpack/msgpack';

import { createMessage } from './common.js';

test('create a Message and get all messages', async () => {
  await runScenario(async scenario => {
    // Construct proper paths for your app.
    // This assumes app bundle created by the `hc app pack` command.
    const testAppPath = process.cwd() + '/../workdir/relay.happ';

    // Set up the app to be installed 
    const appSource = { appBundleSource: { type: "path", value: testAppPath } };

    // Add 2 players with the test app to the Scenario. The returned players
    // can be destructured.
    const [alice, bob] = await scenario.addPlayersWithApps([appSource, appSource]);

    // Shortcut peer discovery through gossip and register all agents in every
    // conductor of the scenario.
    await scenario.shareAllAgents();

    // Bob gets all messages
    let collectionOutput: Link[] = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_all_messages",
      payload: null
    });
    assert.equal(collectionOutput.length, 0);

    // Alice creates a Message
    const createRecord: Record = await createMessage(alice.cells[0]);
    assert.ok(createRecord);
    
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);
    
    // Bob gets all messages again
    collectionOutput = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_all_messages",
      payload: null
    });
    assert.equal(collectionOutput.length, 1);
    assert.deepEqual(createRecord.signed_action.hashed.hash, collectionOutput[0].target);

    // Alice deletes the Message
    await alice.cells[0].callZome({
      zome_name: "relay",
      fn_name: "delete_message",
      payload: createRecord.signed_action.hashed.hash
    });

    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

    // Bob gets all messages again
    collectionOutput = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_all_messages",
      payload: null
    });
    assert.equal(collectionOutput.length, 0);
  });
});

