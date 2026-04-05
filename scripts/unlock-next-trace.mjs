import path from "path";
import { fileURLToPath } from "url";
import { tryRemoveNextTrace } from "./next-fs-tools.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const removed = await tryRemoveNextTrace(root);
if (removed) {
  console.log("[unlock-next-trace] removed .next/trace");
}
