import DOMPurify from "dompurify";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { shareText as sharesheetShareText } from "@buildyourwebapp/tauri-plugin-sharesheet";
import { platform } from "@tauri-apps/plugin-os";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { setModeCurrent } from "@skeletonlabs/skeleton";
import { goto } from "$app/navigation";
import { open } from "@tauri-apps/plugin-shell";
import linkifyStr from "linkify-string";

/**
 * Sanitize user-inputted HTML before we render it to prevent XSS attacks
 *
 * @param html
 * @returns
 */
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
    console.error("Failed to enqueue notification");
  }
}

/**
 * Is app running on mobile?
 *
 * @returns
 */
export function isMobile(): boolean {
  const p = platform();
  return p === "android" || p === "ios";
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

// Prevent internal links from opening in the browser when using Tauri
export function handleLinkClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // Ensure the clicked element is an anchor and has a href attribute
  if (target.closest("a[href]")) {
    // Prevent default action
    event.preventDefault();
    event.stopPropagation();

    const anchor = target.closest("a") as HTMLAnchorElement;
    let link = anchor.getAttribute("href");
    if (
      anchor &&
      anchor.href.startsWith(window.location.origin) &&
      !anchor.getAttribute("rel")?.includes("noopener")
    ) {
      return goto(anchor.pathname); // Navigate internally using SvelteKit's goto
    } else if (anchor && link) {
      // Handle external links using Tauri's API
      if (!link.includes("://")) {
        link = `https://${link}`;
      }
      open(link);
    }
  }
}
