import { derived, get, writable, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import { platform } from "@tauri-apps/plugin-os";
import { goto } from "$app/navigation";
import { page } from "$app/stores";

// tarui-plugin-barcode-scanner launches the scanner as a fullscreen View
// In order to display our overlay upon it, we must have a fully transparent background.
// Thus we must navigate to a new page with only the overlay and a transparent background before opening the scanner.
// This store handles navigation and passing data from the requesting page -> scan page -> requesting page.


export interface ScanStore {
  scan: () => void;
  complete: () => void;
  reset: () => void;
  readResult: () => string | null;
  subscribe: (this: void, run: Subscriber<{
      isSupported: boolean;
      value: string | null;
      onCompleteGoto: string | null;
  }>, invalidate?: Invalidator<{
      isSupported: boolean;
      value: string | null;
      onCompleteGoto: string | null;
  }> | undefined) => Unsubscriber;
}


function  createScanStore() {
  const currentPlatform = platform();
  const isSupported = writable(
    Boolean(currentPlatform === "ios" || currentPlatform === "android"),
  );
  const value = writable<string | null>(null);
  const onCompleteGoto = writable<string | null>(null);

  const { subscribe } = derived([isSupported, value, onCompleteGoto], ([$isSupported, $value, $onCompletedGoto]) => ({
    isSupported: $isSupported,
    value: $value,
    onCompleteGoto: $onCompletedGoto
  }));
  

  function scan() {
    if (!get(isSupported)) return;

    // Save current path so we can navigate there upon completion
    const currentPath = get(page).url.pathname;
    onCompleteGoto.set(currentPath);

    // Goto scan page
    goto("/scan", { replaceState: true });
  }

  function complete(newValue?: string) {
    value.set(newValue || null);
    const nav = get(onCompleteGoto);
    if (nav) {
      goto(nav, { replaceState: true });
    }
  }

  function reset() {
    value.set(null);
    onCompleteGoto.set(null);
  }

  function readResult() {
    if (get(onCompleteGoto) !== get(page).url.pathname) return null;

    const result = get(value);
    reset();
    return result;
  }

  return {
    scan,
    complete,
    reset,
    readResult,
    subscribe
  };
}

export const scanStore = createScanStore();