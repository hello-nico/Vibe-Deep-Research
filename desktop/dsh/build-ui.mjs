import { build } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const external = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"];

// DSH's published client contract is a closure factory, not an ESM app entry.
await build({
  root: desktop,
  configFile: false,
  plugins: [{ name: 'local-pdf-engine', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'pdfium.wasm', source: fs.readFileSync(path.join(desktop, 'node_modules/@embedpdf/snippet/dist/pdfium.wasm')) });
  } }],
  mode: "production",
  esbuild: { jsxDev: false },
  resolve: { alias: { "@": path.join(desktop, "src/verticals/finance") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dsh/finance-ui/lib", emptyOutDir: true,
    watch: process.argv.includes("--watch") ? {} : null,
    lib: { entry: path.join(desktop, "src/verticals/finance/dsh/client.tsx"), formats: ["cjs"], fileName: () => "client.js", cssFileName: "style" },
    rollupOptions: {
      external,
      output: {
        inlineDynamicImports: true,
        banner: 'window.__ModuleLoader__.load({id:"vibe-finance-ui",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
        footer: "return module.exports;}});",
      },
    },
  },
});
