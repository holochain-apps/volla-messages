<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import Moveable from "svelte-moveable";

  export let initialWidth: number = 160;
  export let initialHeight: number = 120;
  export let minWidth: number = 100;
  export let minHeight: number = 75;
  export let maxWidth: number = 400;
  export let maxHeight: number = 300;
  export let boundsPadding: number = 16;
  export let persistKey: string | null = null;
  export let keepAspectRatio: boolean = true;
  export let zIndex: number = 20;

  const dispatch = createEventDispatcher<{
    click: void;
    positionChange: { x: number; y: number; width: number; height: number };
  }>();

  let target: HTMLDivElement;
  let container: HTMLDivElement;
  let width = initialWidth;
  let height = initialHeight;
  let x = 0;
  let y = 0;
  let mounted = false;
  let containerBounds = { width: 0, height: 0 };

  function loadPersistedState() {
    if (!persistKey) return null;
    try {
      const stored = localStorage.getItem(persistKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[ResizablePip] Failed to load persisted state:", e);
    }
    return null;
  }

  function savePersistedState() {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify({ x, y, width, height }));
    } catch (e) {
      console.warn("[ResizablePip] Failed to save persisted state:", e);
    }
  }

  function calculateInitialPosition() {
    const persisted = loadPersistedState();
    const bottomPadding = boundsPadding + 50;

    if (persisted) {
      width = Math.max(minWidth, Math.min(maxWidth, persisted.width || initialWidth));
      height = Math.max(minHeight, Math.min(maxHeight, persisted.height || initialHeight));
      x = persisted.x ?? 0;
      y = persisted.y ?? 0;

      if (container) {
        const rect = container.getBoundingClientRect();
        x = Math.max(boundsPadding, Math.min(rect.width - width - boundsPadding, x));
        y = Math.max(boundsPadding, Math.min(rect.height - height - bottomPadding, y));
      }
    } else {
      if (container) {
        const rect = container.getBoundingClientRect();
        x = rect.width - width - boundsPadding;
        y = rect.height - height - bottomPadding;
      }
    }
  }

  function updateContainerBounds() {
    if (container) {
      const rect = container.getBoundingClientRect();
      containerBounds = { width: rect.width, height: rect.height };
    }
  }

  function handleDrag(e: CustomEvent) {
    const { left, top } = e.detail;
    x = left;
    y = top;
    target.style.left = `${left}px`;
    target.style.top = `${top}px`;
  }

  function handleDragEnd() {
    savePersistedState();
    dispatch("positionChange", { x, y, width, height });
  }

  function handleResize(e: CustomEvent) {
    const { width: newWidth, height: newHeight, drag } = e.detail;
    width = newWidth;
    height = newHeight;
    target.style.width = `${newWidth}px`;
    target.style.height = `${newHeight}px`;
    target.style.transform = drag.transform;
  }

  function handleResizeEnd() {
    savePersistedState();
    dispatch("positionChange", { x, y, width, height });
  }

  function handleClick() {
    dispatch("click");
  }

  function handleWindowResize() {
    updateContainerBounds();
    if (container && target) {
      const rect = container.getBoundingClientRect();
      x = Math.max(boundsPadding, Math.min(rect.width - width - boundsPadding, x));
      y = Math.max(boundsPadding, Math.min(rect.height - height - boundsPadding, y));
      target.style.left = `${x}px`;
      target.style.top = `${y}px`;
    }
  }

  onMount(() => {
    updateContainerBounds();
    calculateInitialPosition();

    if (target) {
      target.style.left = `${x}px`;
      target.style.top = `${y}px`;
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    }

    mounted = true;
    window.addEventListener("resize", handleWindowResize);
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleWindowResize);
  });
</script>

<div
  bind:this={container}
  class="absolute inset-0"
  style="z-index: {zIndex}; pointer-events: none;"
>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    bind:this={target}
    class="absolute cursor-move overflow-hidden rounded-xl shadow-2xl ring-2 ring-white/20"
    style="pointer-events: auto;"
    on:click={handleClick}
  >
    <slot />
  </div>

  {#if mounted && target}
    <Moveable
      {target}
      draggable={true}
      resizable={true}
      keepRatio={keepAspectRatio}
      throttleDrag={0}
      throttleResize={0}
      renderDirections={["se"]}
      edge={false}
      origin={false}
      bounds={{
        left: boundsPadding,
        top: boundsPadding,
        right: containerBounds.width - boundsPadding,
        bottom: containerBounds.height - boundsPadding,
      }}
      {minWidth}
      {minHeight}
      {maxWidth}
      {maxHeight}
      on:drag={handleDrag}
      on:dragEnd={handleDragEnd}
      on:resize={handleResize}
      on:resizeEnd={handleResizeEnd}
    />
  {/if}
</div>
