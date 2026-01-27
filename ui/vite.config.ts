import { internalIpV4Sync } from "internal-ip";
import { purgeCss } from "vite-plugin-tailwind-purgecss";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { version } from "./package.json"; // Import version from package.json

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: internalIpV4Sync(),
      port: 1421,
    },
  },
  plugins: [
    sveltekit(),
    purgeCss(),
    nodePolyfills({
      // Polyfill Node.js globals and modules for simple-peer
      include: ["stream", "buffer", "process", "events", "util"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    "window.__APP_VERSION__": JSON.stringify(version), // Define a global constant
  },
});
