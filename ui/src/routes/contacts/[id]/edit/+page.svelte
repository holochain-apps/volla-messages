<script lang="ts">
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { scanStore } from "$store/ScanStore";
  import { encodeCellIdToBase64, isMobile, makeFullName } from "$lib/utils";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputContact from "../../InputContact.svelte";
  import { goto } from "$app/navigation";
  import { type Contact } from "$lib/types";
  import { getContext } from "svelte";
  import { deriveAgentContactStore, type ContactStore } from "$store/ContactStore";
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";
  import { page } from "$app/stores";

  const allContactsStore = getContext<{ getStore: () => ContactStore }>(
    "allContactsStore",
  ).getStore();

  let contact = deriveAgentContactStore(allContactsStore, $page.params.id);
  let newContact = get(contact).contact;
  let saving = false;

  async function update(val: Contact) {
    saving = true;
    try {
      // Create contact
      await contact.update(val);

      // Navigate to private conversation
      await goto(`/conversations/${encodeCellIdToBase64($contact.cellId)}`);
    } catch (e) {
      console.error(e);
      toast.error($t("common.error_saving", { updating: true }));
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

<Header back title={$t("common.edit_contact")}>
  <div slot="right">
    {#if isMobile()}
      <ButtonIconBare on:click={() => scanStore.scan()} icon="qrCodeScan" moreClassesButton="p-4" />
    {/if}
  </div>
</Header>

<InputContact
  bind:value={newContact}
  editMode
  {saving}
  on:cancel={() => history.back()}
  on:change={(e) => update(e.detail)}
/>
