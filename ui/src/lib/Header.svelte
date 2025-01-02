<script lang="ts">
  import { goto } from "$app/navigation";
  import ButtonIconBare from "./ButtonIconBare.svelte";

  export let back: boolean = false;
  export let backUrl: string | undefined = undefined;
  export let title: string | undefined = undefined;

  function gotoBack() {
    if (backUrl !== undefined) {
      goto(backUrl);
    } else {
      history.back();
    }
  }
</script>

<div class="relative flex w-full flex-row items-center px-4 pt-4">
  {#if backUrl !== undefined || back}
    <ButtonIconBare
      on:click={gotoBack}
      icon="caretLeft"
      moreClasses="!h-[16px] !w-[16px] text-base"
    />
  {/if}

  {#if title !== undefined}
    <h1 class="flex-1 text-center">{title}</h1>
  {/if}

  <slot></slot>
</div>
