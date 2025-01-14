import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginSvelte from "eslint-plugin-svelte";

export default [
  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...eslintPluginSvelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte", "*.svelte", "**/*.ts", "*.ts"],
    languageOptions: {
      parserOptions: {
        svelteConfig: "./svelte.config.js",
      },
    },
  },
];
