<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import ContactEditor from "../ContactEditor.svelte";
  import { scanStore } from "$store/ScanStore";
  import { isMobile } from "$lib/utils";

  let agentPubKeyB64: string | null = null;

  function loadScanResult() {
    agentPubKeyB64 = scanStore.readResult();
  }
  loadScanResult();
</script>

<Header back title={$t("contacts.create_new_contact")}>
  {#if isMobile()}
    <div class="absolute right-0">
      <button class="z-10 mr-5 text-4xl" on:click={() => scanStore.scan()}>
        <SvgIcon icon="qrCodeScan" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
      </button>
    </div>
  {/if}
</Header>

<ContactEditor {agentPubKeyB64} creating={true} />
