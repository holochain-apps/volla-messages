import i18n, { type Config } from "sveltekit-i18n";
import { flatten } from "lodash-es";

const ALL_LOCALES = ["bg", "da", "de", "en", "es", "fr", "it", "no", "ro", "sk", "sv", "nl"];

function makeLoaders(locales: string[]) {
  const loaders = locales.map((locale) => [
    {
      locale,
      key: "common",
      loader: async () => (await import(`./${locale}/common.json`)).default,
    },
    {
      locale,
      key: "contacts",
      routes: [/\/contacts(.*)/, /^\/conversations(.*)/],
      loader: async () => (await import(`./${locale}/contacts.json`)).default,
    },
    {
      locale,
      key: "conversations",
      routes: [/^\/conversations(.*)/, "/create"],
      loader: async () => (await import(`./${locale}/conversations.json`)).default,
    },
    {
      locale,
      key: "create",
      routes: ["/create", /(.*)\/invite/],
      loader: async () => (await import(`./${locale}/create.json`)).default,
    },
  ]);

  return flatten(loaders);
}


type Params = 
  | { name: string }
  | { updating: boolean }
  | { count: number }
  | { date: number }
  | { public: boolean }
  | { existingConversation: boolean };

const config: Config<Params> = {
  fallbackLocale: "en",
  loaders: makeLoaders(ALL_LOCALES),
};

export const { t, locale, locales, loading, loadTranslations } = new i18n(config);
