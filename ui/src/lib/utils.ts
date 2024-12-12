import DOMPurify from "dompurify";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { shareText as sharesheetShareText } from "@buildyourwebapp/tauri-plugin-sharesheet";
import { platform } from "@tauri-apps/plugin-os";
import { setModeCurrent } from "@skeletonlabs/skeleton";
import { open } from "@tauri-apps/plugin-shell";
import linkifyStr from "linkify-string";

export const MIN_TITLE_LENGTH = 3;

export function sanitizeHTML(html: string) {
  return DOMPurify.sanitize(html);
}

/**
 * Search the provided text for URLs, replacing them with HTML link tags pointing to that URL
 *
 * @param text
 * @returns
 */
export const linkify = (text: string): string =>
  linkifyStr(text, {
    defaultProtocol: "https",
    rel: {
      url: "noopener noreferrer",
    },
    target: "_blank",
  });

export function shareText(text: string | Promise<string>) {
  if (typeof text === "string") {
    if (text && text.trim().length > 0) {
      return sharesheetShareText(text);
    }
  } else {
    return text.then((t) => sharesheetShareText(t));
  }
}

export function copyToClipboard(text: string | Promise<string>) {
  if (typeof text === "string") {
    if (text && text.trim().length > 0) {
      console.log("Copying to clipboard", text);
      return navigator.clipboard.writeText(text);
    }
  } else {
    if (typeof ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/plain": text.then((t) => {
          console.log("Copying to clipboard", t);
          return new Blob([t], { type: "text/plain" });
        }),
      });
      return navigator.clipboard.write([item]);
    } else {
      console.log("Copying to clipboard", text);
      return text.then((t) => navigator.clipboard.writeText(t));
    }
  }
}

// Crop avatar image and return a base64 bytes string of its content
export function resizeAndExportAvatar(img: HTMLImageElement) {
  const MAX_WIDTH = 300;
  const MAX_HEIGHT = 300;

  let width = img.width;
  let height = img.height;

  // Change the resizing logic
  if (width > height) {
    if (width > MAX_WIDTH) {
      height = height * (MAX_WIDTH / width);
      width = MAX_WIDTH;
    }
  } else {
    if (height > MAX_HEIGHT) {
      width = width * (MAX_HEIGHT / height);
      height = MAX_HEIGHT;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0, width, height);

  // return the .toDataURL of the temp canvas
  return canvas.toDataURL();
}

export function handleFileChange(event: Event, callback: (imageData: string) => void) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>): void => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const imageData = resizeAndExportAvatar(img);
        callback(imageData);
      };
      img.src = e.target?.result as string;
    };

    reader.onerror = (e): void => {
      console.error("Error reading file:", e);
      reader.abort();
    };

    reader.readAsDataURL(file);
  }
}

async function checkPermission() {
  if (!(await isPermissionGranted())) {
    return (await requestPermission()) === "granted";
  }
  return true;
}

export async function enqueueNotification(title: string, body: string) {
  if (!(await checkPermission())) {
    return;
  }
  sendNotification({ title, body });
}

export function isLinux(): boolean {
  return platform() === "linux";
}

export function isWindows(): boolean {
  return platform() === "windows";
}

export function isMacOS(): boolean {
  return platform() === "macos";
}

export function isDesktop(): boolean {
  return isMacOS() || isLinux() || isWindows();
}

export function isAndroid(): boolean {
  return platform() === "android";
}

export function isIOS(): boolean {
  return platform() === "ios";
}

export function isMobile(): boolean {
  return isAndroid() || isIOS();
}

export async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);

  return new Promise((resolve, reject) => {
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject("Failed to convert File to Image: File contents are not a string");
      }
    };
    reader.onerror = (e) => reject(`Failed to convert File to Image: ${e}`);
  });
}

// To change from light mode to dark mode based on system settings
// XXX: not using the built in skeleton autoModeWatcher() because it doesn't set modeCurrent in JS which we use
function setLightDarkMode(value: boolean) {
  const elemHtmlClasses = document.documentElement.classList;
  const classDark = `dark`;
  value === true ? elemHtmlClasses.remove(classDark) : elemHtmlClasses.add(classDark);
  setModeCurrent(value);
}

export function initLightDarkModeSwitcher() {
  const mql = window.matchMedia("(prefers-color-scheme: light)");

  setLightDarkMode(mql.matches);
  mql.onchange = () => {
    setLightDarkMode(mql.matches);
  };
}

/**
 * Ensure that external links are opened with the system default browser or mail client.
 *
 * @param e: click event
 * @returns
 */
export function handleLinkClick(e: MouseEvent) {
  // Abort if clicked element is not a link
  const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement;
  if (!anchor || anchor?.href.startsWith(window.location.origin)) return;

  // Handle external links using Tauri's API
  e.preventDefault();
  e.stopPropagation();
  open(anchor.getAttribute("href") as string);
}

export function convertDataURIToUint8Array(dataURI: string): Uint8Array {
  const BASE64_MARKER = ";base64,";
  const base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
  const base64 = dataURI.substring(base64Index);
  const raw = window.atob(base64);
  const array = new Uint8Array(new ArrayBuffer(raw.length));

  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }

  return array;
}
