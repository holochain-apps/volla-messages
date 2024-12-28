<script lang="ts">
  import { svgIcons } from "./svgIcons";

  export let icon: string;
  export let style: string = "";
  export let color: string = "#FF3615";
  export let size: number = 20;
  export let moreClasses: string = "";

  $: iconStr = () => {
    let i = svgIcons[icon];
    if (!i) console.error("missing icon for ", icon);
    if (color) {
      i = i.replace("<svg", `<svg fill="${color}" `);
    }
    return `data:image/svg+xml;charset=utf-8,${i.replace("#", "%23")}`;
  };

  style = style + ` width: ${size}px;`;
</script>

<div class={`icon + ${moreClasses}`} {style}>
  <img width={size} height="auto" src={iconStr()} alt={icon} />
</div>

<style>
  .icon {
    display: flex;
  }

  .icon img {
    vertical-align: middle;
    fill: #ffffff;
  }
</style>
