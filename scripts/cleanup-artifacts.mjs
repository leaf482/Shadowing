/**
 * Same as scripts/cleanup-artifacts.sh — works on Windows without bash/WSL.
 */
import { readdirSync, rmSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function rmDir(parts) {
  try {
    rmSync(join(root, ...parts), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

rmDir(["infra", "sam", ".aws-sam"]);
rmDir([".aws-sam"]);

let removed = 0;
try {
  for (const name of readdirSync(root)) {
    if (name.startsWith(".env.bak.")) {
      try {
        unlinkSync(join(root, name));
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
} catch {
  /* unreadable root */
}

console.log(`Cleaned .aws-sam build dirs and ${removed} .env.bak.* file(s) under ${root}`);
