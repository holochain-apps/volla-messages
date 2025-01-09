<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";
  export let moreClasses: string;
</script>

<button
  type="button"
  on:click|stopPropagation
  class="inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-75 focus:outline-none"
  aria-label="Delete"
>
  <SvgIcon icon="delete" {moreClasses} />
</button>
