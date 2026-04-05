import fs from "fs";
import path from "path";

/**
 * Windows often locks `.next/trace` (EPERM), which blocks deleting `.next` and causes chunk 404s.
 * Best-effort removal with short retries before `next dev` or full clean.
 */
export async function tryRemoveNextTrace(projectRoot) {
  const trace = path.join(projectRoot, ".next", "trace");
  for (let i = 0; i < 12; i++) {
    try {
      if (!fs.existsSync(trace)) {
        return false;
      }
      fs.unlinkSync(trace);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return false;
}
