<script lang="ts">
  import { page } from "$app/stores";
  import Header from "$lib/Header.svelte";
  import ContactEditor from "../ContactEditor.svelte";
</script>

<Header back />

<ContactEditor agentPubKeyB64={$page.params.id} />
