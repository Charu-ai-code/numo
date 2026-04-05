import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tryRemoveNextTrace } from "./next-fs-tools.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".next");

if (!fs.existsSync(dir)) {
  console.log("[clean:next] no .next folder, nothing to remove");
  process.exit(0);
}

const traceRemoved = await tryRemoveNextTrace(root);
if (traceRemoved) {
  console.log("[clean:next] removed .next/trace first");
}

try {
  fs.rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 12,
    retryDelay: 200,
  });
  console.log("[clean:next] removed .next");
} catch (e) {
  console.error(
    "[clean:next] could not remove .next (stop all Node/dev servers; dev uses .next-build via `npm run dev`)"
  );
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
