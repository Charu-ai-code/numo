import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".next-build");

if (!fs.existsSync(dir)) {
  console.log("[clean:next-dev] no .next-build folder");
  process.exit(0);
}

try {
  fs.rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
  console.log("[clean:next-dev] removed .next-build");
} catch (e) {
  console.error("[clean:next-dev] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
