<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let replyCount: number;

  const dispatch = createEventDispatcher<{ click: void }>();

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    dispatch("click");
  }
</script>

<button
  class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 my-1 inline-flex cursor-pointer items-center gap-1 text-xs transition-colors"
  on:click={handleClick}
>
  <SvgIcon icon="speechBubble" moreClasses="!w-3.5 !h-3.5" />
  <span class="font-medium">
    {replyCount}
  </span>
</button>
