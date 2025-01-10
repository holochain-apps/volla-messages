import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { shareText as sharesheetShareText } from "@buildyourwebapp/tauri-plugin-sharesheet";
import { platform } from "@tauri-apps/plugin-os";
import { setModeCurrent } from "@skeletonlabs/skeleton";
import { open } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Base64 } from "js-base64";
import type { CellId } from "@holochain/client";
import type { CellIdB64 } from "./types";

/**
 * Share text via sharesheet
 *
 * @param text
 * @returns
 */
export function shareText(text: string): Promise<void> {
  if (!isMobile()) throw Error("Sharesheet is only supported on mobile");

  const normalized = text.trim();
  if (normalized.length === 0) throw Error("Text is empty");

  return sharesheetShareText(normalized);
}

/**
 * Copy text to clipboard
 *
 * @param text
 * @returns
 */
export function copyToClipboard(text: string): Promise<void> {
  const normalized = text.trim();
  if (normalized.length === 0) throw Error("Text is empty");

  return writeText(text);
}

/**
 * Send a system notification
 * If permissions have not been granted for sending notifications, request them.
 *
 * @param title
 * @param body
 */
export async function enqueueNotification(title: string, body: string) {
  try {
    const hasPermission = await isPermissionGranted();
    if (!hasPermission) {
      const permission = await requestPermission();
      if (permission !== "granted") throw new Error("Permission to create notifications denied");
    }

    sendNotification({ title, body });
  } catch (e) {
    console.error("Failed to enqueue notification", e);
  }
}

/**
 * Is app running on mobile?
 *
 * @returns
 */
export function isMobile(): boolean {
  const val = platform();
  return val === "android" || val === "ios";
}

/**
 * Convert file to data url
 *
 * @param file
 * @returns
 */
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

function setLightDarkMode(value: boolean) {
  const elemHtmlClasses = document.documentElement.classList;
  const classDark = `dark`;
  value === true ? elemHtmlClasses.remove(classDark) : elemHtmlClasses.add(classDark);
  setModeCurrent(value);
}

/**
 * Toggle dark mode to mirror system settings.
 * We are not using skeleton's autoModeWatcher() because it doesn't update modeCurrent.
 * @param value
 */

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

/**
 * Convert a base64 encoded data URI to a Uint8Array of the decoded bytes.
 *
 * @param dataURI
 * @returns
 */
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

export function makeFullName(firstName: string, lastName?: string): string {
  const hasLastName = lastName !== undefined && lastName.length > 0;
  return `${firstName}${hasLastName ? " " + lastName : ""}`;
}

export function encodeCellIdToBase64(cellId: CellId): CellIdB64 {
  return Base64.fromUint8Array(new Uint8Array([...cellId[0], ...cellId[1]]), true);
}

export function decodeCellIdFromBase64(base64: CellIdB64): CellId {
  const bytes = Base64.toUint8Array(base64);
  return [bytes.slice(0, 39), bytes.slice(39)];
}

export function isSameDay(d1: Date, d2?: Date): boolean {
  if (d2 === undefined) return false;

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}
