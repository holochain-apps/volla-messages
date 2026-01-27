import { join } from "path";
import type { Config } from "tailwindcss";
import { skeleton } from "@skeletonlabs/tw-plugin";
import forms from "@tailwindcss/forms";
import plugin from "tailwindcss/plugin";
import { vollaTheme } from "./volla-theme";

export default {
  darkMode: "media",
  content: [
    "./src/**/*.{html,js,svelte,ts}",
    join(require.resolve("@skeletonlabs/skeleton"), "../**/*.{html,js,svelte,ts}"),
  ],
  theme: {
    extend: {
      screens: {
        xs: "400px",
        portrait: { raw: "(orientation: portrait)" },
        landscape: { raw: "(orientation: landscape)" },
      },
      fontSize: {
        xxs: "0.6rem",
      },
      fontFamily: {
        sans: ["NotoSans", "ui-sans-serif", "system-ui"],
      },
      maxWidth: {
        "1/2": "50%",
        "2/3": "66%",
      },
      backgroundImage: {
        appLogo: "url(/app-logo.png)",
        clearSkiesGray: "url(/clear-skies-gray.png)",
        clearSkiesWhite: "url(/clear-skies-white.png)",
        holochainLogoCharcoal: "url(/holochain-charcoal.png)",
        holochainLogoWhite: "url(/holochain-white.png)",
      },
    },
  },
  plugins: [
    forms,
    skeleton({
      themes: {
        preset: [
          {
            name: "skeleton",
            enhancements: true,
          },
        ],
        custom: [vollaTheme],
      },
    }),
    // Custom utilities for conference UI
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          /* Hide scrollbar for Chrome, Safari and Opera */
          "&::-webkit-scrollbar": {
            display: "none",
          },
          /* Hide scrollbar for IE, Edge and Firefox */
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
        },
      });
    }),
  ],
} satisfies Config;
