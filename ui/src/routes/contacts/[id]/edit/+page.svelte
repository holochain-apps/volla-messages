<script lang="ts">
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { scanStore } from "$store/ScanStore";
  import { isMobile, makeFullName } from "$lib/utils";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputContact from "../../InputContact.svelte";
  import { goto } from "$app/navigation";
  import { type Contact } from "$lib/types";
  import { getContext } from "svelte";
  import { deriveOneContactStore, type ContactStore } from "$store/ContactStore";
  import type { RelayStore } from "$store/RelayStore";
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";
  import { page } from "$app/stores";

  // Silly thing to get around typescript issues with sveltekit-i18n
  const tAny = t as any;

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  let saving = false;
  $: contact = deriveOneContactStore(contactStore, $page.params.id);

  let newContact = get(contact).contact;

  async function update(val: Contact) {
    saving = true;
    try {
      // Create contact
      await contact.update(val);

      // Navigate to private conversation
      await goto(`/conversations/${encodeHashToBase64($contact.cellId[0])}`);
    } catch (e) {
      console.error(e);
      toast.error($tAny("contacts.error_saving", { updating: true }));
    }
    saving = false;
  }

  function loadScanResult() {
    const agentPubKeyB64: AgentPubKeyB64 | null = scanStore.readResult();
    if (!agentPubKeyB64) return;

    newContact.public_key = decodeHashFromBase64(agentPubKeyB64);
  }
  loadScanResult();
</script>

<Header back title={$t("contacts.create_new_contact")}>
  <div slot="right">
    {#if isMobile()}
      <ButtonIconBare on:click={() => scanStore.scan()} icon="qrCodeScan" />
    {/if}
  </div>
</Header>

<InputContact
  bind:value={newContact}
  on:cancel={() => history.back()}
  on:change={(e) => update(e.detail)}
/>
