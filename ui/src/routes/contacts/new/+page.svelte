<script lang="ts">
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { scanStore } from "$store/ScanStore";
  import { isMobile, makeFullName } from "$lib/utils";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputContact from "../InputContact.svelte";
  import { goto } from "$app/navigation";
  import { Privacy, type Contact } from "$lib/types";
  import { getContext } from "svelte";
  import type { ContactStore } from "$store/ContactStore";
  import type { RelayStore } from "$store/RelayStore";
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";

  // Silly thing to get around typescript issues with sveltekit-i18n
  const tAny = t as any;

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  let saving = false;
  let contact: Contact = {
    first_name: "",
    last_name: "",
    avatar: "",
    public_key: new Uint8Array(),
  };

  async function create(contact: Contact) {
    saving = true;
    try {
      // Create cell for private convesation
      const conversation = await relayStore.createConversation(
        makeFullName(contact.first_name, contact.last_name),
        "",
        Privacy.Private,
        [encodeHashToBase64(contact.public_key)],
      );
      const cellId = get(conversation).conversation.cellId;

      // Create contact
      await contactStore.create(contact, cellId);

      // Navigate to private conversation
      await goto(`/conversations/${encodeHashToBase64(cellId[0])}`);
    } catch (e) {
      console.error(e);
      toast.error($tAny("contacts.error_saving", { updating: false }));
    }
    saving = false;
  }

  function loadScanResult() {
    const agentPubKeyB64: AgentPubKeyB64 | null = scanStore.readResult();
    if (!agentPubKeyB64) return;

    contact.public_key = decodeHashFromBase64(agentPubKeyB64);
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
  bind:value={contact}
  {saving}
  on:cancel={() => history.back()}
  on:change={(e) => create(e.detail)}
/>
