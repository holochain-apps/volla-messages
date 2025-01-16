<script lang="ts">
  import Button from "$lib/Button.svelte";
  import { createEventDispatcher } from "svelte";
  import { t } from "$translations";
  import Dialog from "./Dialog.svelte";

  export let open = false;
  export let title: string;
  export let loading: boolean = false;
  export let actionButtonLabel = $t("common.confirm");
  export let actionButtonIcon: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ confirm: null; cancel: null }>();

  function handleConfirm() {
    dispatch("confirm");
  }

  function handleCancel() {
    open = false;
    dispatch("cancel");
  }
</script>

<Dialog bind:open {title}>
  <div class="mb-6">
    <slot />
  </div>
  <div class="flex justify-center gap-4">
    <Button
      moreClasses="px-3 text-sm sm:px-4 sm:text-base"
      on:click={handleCancel}
      disabled={loading}
    >
      {$t("common.cancel")}
    </Button>
    <Button
      moreClasses="px-3 text-sm sm:px-4 sm:text-base"
      on:click={handleConfirm}
      {loading}
      disabled={loading}
      icon={actionButtonIcon}
    >
      {actionButtonLabel}
    </Button>
  </div>
</Dialog>
