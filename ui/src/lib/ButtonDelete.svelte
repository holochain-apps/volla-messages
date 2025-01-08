<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let onDelete: (event: MouseEvent) => void;
  export let moreClasses: string;

  function handleClick(event: MouseEvent) {
    // It ensures that the click doesn't bubble up to parent elements
    // It's important when the button is nested inside other clickable elements
    event.stopPropagation();
    onDelete(event);
  }
</script>

<button
  type="button"
  on:click={handleClick}
  class="inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-75 focus:outline-none"
  aria-label="Delete"
>
  <SvgIcon icon="delete" {moreClasses} />
</button>
