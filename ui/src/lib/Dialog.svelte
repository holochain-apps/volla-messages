<script lang="ts">
  import Button from "$lib/Button.svelte";
  import { createEventDispatcher } from "svelte";

  export let open = false;
  export let title: string;
  export let actionButtonLabel = "Confirm";

  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch("confirm");
    open = false;
  }

  function handleCancel() {
    dispatch("cancel");
    open = false;
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
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
      <div class="flex justify-end space-x-4">
        <Button variant="outline" on:click={handleCancel}>Cancel</Button>
        <Button on:click={handleConfirm}>{actionButtonLabel}</Button>
      </div>
    </div>
  </div>
{/if}
