import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Flowghan is embedded in the Ebright portal, served same-origin under
  // /flowghan-embed/* (Next.js rewrites proxy that subpath to this app's Express
  // server). Assets must therefore load from that base, not the domain root.
  base: "/flowghan-embed/",
  css: {
    // This app lives inside the portal repo, whose root postcss.config.mjs pulls
    // in Tailwind. Flowghan uses inline styles, not PostCSS — declare an empty
    // config so Vite doesn't walk up and load the portal's Tailwind pipeline.
    postcss: {},
  },
});
