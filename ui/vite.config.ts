import { internalIpV4Sync } from "internal-ip";
import { purgeCss } from "vite-plugin-tailwind-purgecss";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
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
  plugins: [sveltekit(), purgeCss()],
  define: {
    "window.__APP_VERSION__": JSON.stringify(version), // Define a global constant
  },
  optimizeDeps: {
    include: ["pdfjs-dist/legacy/build/pdf.js", "pdfjs-dist/legacy/build/pdf.worker.js"],
  },
  ssr: {
    noExternal: ["pdfjs-dist"],
  },
});
