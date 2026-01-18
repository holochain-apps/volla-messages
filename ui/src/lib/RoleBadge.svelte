<script lang="ts">
  import { t } from "$translations/index";
  import { ConferenceRole } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let role: ConferenceRole | undefined = undefined;
  export let size: "sm" | "md" = "sm";
  export let showIcon: boolean = false;

  $: isHost = role === ConferenceRole.Host;
  $: isCoHost = role === ConferenceRole.CoHost;
  $: showBadge = role !== undefined && role !== ConferenceRole.Member;

  $: sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-[8px] sm:text-[10px] gap-0.5"
    : "px-2 py-1 text-xs gap-1";

  $: colorClasses = isHost
    ? "bg-primary-500 text-white"
    : "bg-tertiary-500 text-secondary-500 dark:bg-secondary-400 dark:text-tertiary-500";

  $: label = isHost
    ? $t("common.conference_roleHost") || "Host"
    : $t("common.conference_roleCoHost") || "Co-Host";
</script>

{#if showBadge}
  <span
    class="inline-flex items-center rounded font-bold transition-transform duration-150 hover:scale-105 {sizeClasses} {colorClasses}"
  >
    {#if showIcon}
      <SvgIcon
        icon={isHost ? "crown" : "star"}
        moreClasses={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"}
      />
    {/if}
    {label}
  </span>
{/if}
