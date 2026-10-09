import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://www.grupoary.com.mx",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
