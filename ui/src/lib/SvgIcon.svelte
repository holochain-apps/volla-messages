<script lang="ts">
  import { svgIcons } from "$lib/svgIcons";

  export let icon: string;
  export let moreClasses: string = "";
  export let style: string = "";
</script>

<div class="inline-block h-[24px] w-[24px] {moreClasses}" {style}>
  {@html svgIcons[icon]}
</div>
