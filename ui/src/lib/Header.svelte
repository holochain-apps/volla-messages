<script lang="ts">
  import { goto } from "$app/navigation";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";

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

<div class="flex w-full items-center">
  <div class="flex-none">
    <slot name="left">
      {#if backUrl !== undefined || back}
        <ButtonIconBare
          on:click={gotoBack}
          icon="caretLeft"
          moreClasses="!h-[16px] !w-[16px] text-base"
          moreClassesButton="p-4"
        />
      {/if}
    </slot>
  </div>

  <div class="flex grow items-center justify-center">
    <slot name="center">
      {#if title !== undefined}
        <h1 class="py-2">{title}</h1>
      {/if}
    </slot>
  </div>

  <div class="flex-none">
    <slot name="right"></slot>
  </div>
</div>
