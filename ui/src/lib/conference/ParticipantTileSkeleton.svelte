<script lang="ts">
  export let variant: "grid" | "main" | "sidebar" = "grid";

  $: containerClasses =
    variant === "main"
      ? "relative flex-1 overflow-hidden rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-500 sm:rounded-2xl"
      : variant === "sidebar"
        ? "relative min-w-[100px] flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500 sm:min-w-0 sm:rounded-xl"
        : "relative overflow-hidden rounded-2xl bg-gradient-to-br from-secondary-400 to-secondary-500";

  $: avatarSize =
    variant === "main"
      ? "h-32 w-32 sm:h-48 sm:w-48"
      : variant === "sidebar"
        ? "h-12 w-12 sm:h-20 sm:w-20"
        : "h-14 w-14 sm:h-20 sm:w-20";

  $: badgeClasses =
    variant === "main"
      ? "bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6"
      : variant === "sidebar"
        ? "bottom-1.5 left-1.5 right-1.5 sm:bottom-2 sm:left-2 sm:right-2"
        : "bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4";
</script>

<div class={containerClasses}>
  <div
    class="from-secondary-400 via-secondary-500 to-secondary-400 absolute inset-0 animate-pulse bg-gradient-to-br"
  >
    <div
      class="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"
    />
  </div>

  <div class="absolute inset-0 flex items-center justify-center">
    <div class="bg-secondary-400/50 rounded-full {avatarSize} animate-pulse" />
  </div>

  <div class="absolute {badgeClasses} flex items-center justify-between">
    <div
      class="flex items-center gap-1.5 rounded-xl bg-black/30 px-2 py-1.5 backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-2"
    >
      <div class="bg-secondary-400/50 h-5 w-5 animate-pulse rounded-full sm:h-6 sm:w-6" />
      <div class="bg-secondary-400/50 h-3 w-16 animate-pulse rounded sm:w-24" />
    </div>
  </div>

  {#if variant === "main"}
    <div class="absolute left-4 top-4 sm:left-6 sm:top-6">
      <div
        class="bg-secondary-500/50 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 backdrop-blur-sm"
      >
        <div class="bg-secondary-400/50 h-2.5 w-2.5 animate-pulse rounded-full" />
        <div class="bg-secondary-400/50 h-2 w-16 animate-pulse rounded" />
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }
</style>
