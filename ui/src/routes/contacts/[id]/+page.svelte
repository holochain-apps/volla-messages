<script lang="ts">
  import { page } from "$app/stores";
  import Header from "$lib/Header.svelte";
  import ContactEditor from "../ContactEditor.svelte";

  $: contactId = $page.params.id;
</script>

<Header backUrl="/create" />

<ContactEditor agentPubKeyB64={contactId} />
