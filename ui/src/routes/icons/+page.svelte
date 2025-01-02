<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { svgIcons } from "$lib/svgIcons";
</script>

<div class="flex flex-col items-start justify-start">
  {#each Object.entries(svgIcons) as [name, value]}
    <b>{name}</b>

    <div class="mb-12">
      <SvgIcon icon={name} moreClasses="text-blue-500" />

      <div class="border-2 border-solid border-white">
        <SvgIcon icon={name} moreClasses="h-[80px] w-[80px] text-red-500" />
      </div>
    </div>
  {/each}
</div>
