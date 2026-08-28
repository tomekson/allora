import { defineConfig } from "astro/config";

// SSG katalog. Data se ve Fázi 2 budou tahat při buildu z backend API
// nebo přímo z DB, výstup je čistě statický web.
export default defineConfig({
  output: "static",
  site: "https://example.cz", // TODO: doplnit produkční doménu
});
