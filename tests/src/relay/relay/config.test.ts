import { assert, test } from "vitest";

import { runScenario, dhtSync, CallableCell } from '@holochain/tryorama';
import {
  NewEntryAction,
  ActionHash,
  Record,
  Link,
  CreateLink,
  DeleteLink,
  SignedActionHashed,
  AppBundleSource,
  fakeActionHash,
  fakeAgentPubKey,
  fakeEntryHash
} from '@holochain/client';
import { decode } from '@msgpack/msgpack';

import { createConfig, sampleConfig } from './common.js';

test('create Config', async () => {
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

    // Alice creates a Config
    const record: Record = await createConfig(alice.cells[0]);
    assert.ok(record);
  });
});

test('create and read Config', async () => {
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

    const sample = await sampleConfig(alice.cells[0]);

    // Alice creates a Config
    const record: Record = await createConfig(alice.cells[0], sample);
    assert.ok(record);

    // Wait for the created entry to be propagated to the other node.
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

    // Bob gets the created Config
    const createReadOutput: Record = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_original_config",
      payload: record.signed_action.hashed.hash,
    });
    assert.deepEqual(sample, decode((createReadOutput.entry as any).Present.entry) as any);

  });
});

test('create and update Config', async () => {
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

    // Alice creates a Config
    const record: Record = await createConfig(alice.cells[0]);
    assert.ok(record);
        
    const originalActionHash = record.signed_action.hashed.hash;
 
    // Alice updates the Config
    let contentUpdate: any = await sampleConfig(alice.cells[0]);
    let updateInput = {
      original_config_hash: originalActionHash,
      previous_config_hash: originalActionHash,
      updated_config: contentUpdate,
    };

    let updatedRecord: Record = await alice.cells[0].callZome({
      zome_name: "relay",
      fn_name: "update_config",
      payload: updateInput,
    });
    assert.ok(updatedRecord);

    // Wait for the updated entry to be propagated to the other node.
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);
        
    // Bob gets the updated Config
    const readUpdatedOutput0: Record = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_latest_config",
      payload: updatedRecord.signed_action.hashed.hash,
    });
    assert.deepEqual(contentUpdate, decode((readUpdatedOutput0.entry as any).Present.entry) as any);

    // Alice updates the Config again
    contentUpdate = await sampleConfig(alice.cells[0]);
    updateInput = { 
      original_config_hash: originalActionHash,
      previous_config_hash: updatedRecord.signed_action.hashed.hash,
      updated_config: contentUpdate,
    };

    updatedRecord = await alice.cells[0].callZome({
      zome_name: "relay",
      fn_name: "update_config",
      payload: updateInput,
    });
    assert.ok(updatedRecord);

    // Wait for the updated entry to be propagated to the other node.
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);
        
    // Bob gets the updated Config
    const readUpdatedOutput1: Record = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_latest_config",
      payload: updatedRecord.signed_action.hashed.hash,
    });
    assert.deepEqual(contentUpdate, decode((readUpdatedOutput1.entry as any).Present.entry) as any);

    // Bob gets all the revisions for Config
    const revisions: Record[] = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_all_revisions_for_config",
      payload: originalActionHash,
    });
    assert.equal(revisions.length, 3);
    assert.deepEqual(contentUpdate, decode((revisions[2].entry as any).Present.entry) as any);
  });
});

test('create and delete Config', async () => {
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

    const sample = await sampleConfig(alice.cells[0]);

    // Alice creates a Config
    const record: Record = await createConfig(alice.cells[0], sample);
    assert.ok(record);

    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);


    // Alice deletes the Config
    const deleteActionHash = await alice.cells[0].callZome({
      zome_name: "relay",
      fn_name: "delete_config",
      payload: record.signed_action.hashed.hash,
    });
    assert.ok(deleteActionHash);

    // Wait for the entry deletion to be propagated to the other node.
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);
        
    // Bob gets the oldest delete for the Config
    const oldestDeleteForConfig: SignedActionHashed = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_oldest_delete_for_config",
      payload: record.signed_action.hashed.hash,
    });
    assert.ok(oldestDeleteForConfig);
        
    // Bob gets the deletions for the Config
    const deletesForConfig: SignedActionHashed[] = await bob.cells[0].callZome({
      zome_name: "relay",
      fn_name: "get_all_deletes_for_config",
      payload: record.signed_action.hashed.hash,
    });
    assert.equal(deletesForConfig.length, 1);


  });
});
