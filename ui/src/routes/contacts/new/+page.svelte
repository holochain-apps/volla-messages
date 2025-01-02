<script lang="ts">
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import ContactEditor from "../ContactEditor.svelte";
  import { scanStore } from "$store/ScanStore";
  import { isMobile } from "$lib/utils";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";

  let agentPubKeyB64: string | null = null;

  function loadScanResult() {
    agentPubKeyB64 = scanStore.readResult();
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

<ContactEditor {agentPubKeyB64} creating={true} />
