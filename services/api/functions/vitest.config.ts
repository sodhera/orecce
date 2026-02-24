import { defineConfig } from "vitest/config";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// Resolve via the workspace symlink in node_modules — stable regardless of cwd
const apiCoreSrc = path.dirname(require.resolve("@orecce/api-core/package.json")) + "/src";

export default defineConfig({
  plugins: [
    {
      name: "resolve-api-core",
      resolveId(id) {
        const prefix = "@orecce/api-core/src/";
        if (id.startsWith(prefix)) {
          return path.join(apiCoreSrc, id.slice(prefix.length) + ".ts");
        }
        if (id === "@orecce/api-core/src") {
          return path.join(apiCoreSrc, "index.ts");
        }
        return null;
      }
    }
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
