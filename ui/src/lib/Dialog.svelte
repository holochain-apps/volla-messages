<script lang="ts">
  export let open = false;
  export let title: string;

  function handleCancel() {
    open = false;
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
      <slot></slot>
    </div>
  </div>
{/if}
