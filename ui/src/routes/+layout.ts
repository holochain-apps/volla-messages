export const prerender = false;
export const ssr = false;

import type { LayoutLoad } from "./$types";
import { loadTranslations } from "$translations";

export const load: LayoutLoad = async ({ url }) => {
  const { pathname } = url;

  const initLocale = navigator.language.split("-")[0];

  await loadTranslations(initLocale, pathname);

  return {};
};
