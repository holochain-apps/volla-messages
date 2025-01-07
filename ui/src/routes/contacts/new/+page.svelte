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
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import toast from "svelte-french-toast";
  import type { ConversationStore } from "$store/ConversationStore";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

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
      const cellIdB64 = await conversationStore.create({
        config: {
          title: makeFullName(contact.first_name, contact.last_name),
          image: "",
        },
        privacy: Privacy.Private,
      });
      // Invite agent to conversation
      await conversationStore.invite(cellIdB64, [encodeHashToBase64(contact.public_key)]);

      // Create contact
      await contactStore.create(contact, cellIdB64);

      // Navigate to conversation
      await goto(`/conversations/${cellIdB64}`);
    } catch (e) {
      console.error(e);
      toast.error($t("contacts.error_saving", { updating: false }));
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
