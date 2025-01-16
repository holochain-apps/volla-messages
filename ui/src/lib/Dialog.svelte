<script lang="ts">
  import Button from "$lib/Button.svelte";
  import { createEventDispatcher } from "svelte";
  import { t } from "$translations";

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

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-0">
    <div
      class="fixed inset-0 bg-black bg-opacity-50"
      role="button"
      tabindex="0"
      on:click={handleCancel}
      on:keydown={(e) => e.key === "Enter" && handleCancel()}
    />
    <div class="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold">{title}</h2>
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
    </div>
  </div>
{/if}
