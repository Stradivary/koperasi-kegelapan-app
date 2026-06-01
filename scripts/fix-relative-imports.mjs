/**
 * fix-relative-imports.mjs
 *
 * Scans all .ts/.tsx files under src/ and replaces relative imports that
 * cross into a top-level src subfolder with the #/ alias.
 *
 * Examples:
 *   ../lib/foo        → #/lib/foo
 *   ../../components  → #/components
 *   ../../../hooks/x  → #/hooks/x
 *
 * Only replaces paths that resolve to a known top-level src subfolder.
 * Paths that stay within the same top-level folder are left alone.
 *
 * Usage:
 *   node scripts/fix-relative-imports.mjs [--dry-run]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

const DRY_RUN = process.argv.includes("--dry-run");

// Collect all top-level src subfolder names
const TOP_LEVEL_FOLDERS = new Set(
  readdirSync(SRC).filter((entry) => statSync(join(SRC, entry)).isDirectory()),
);

// Regex: matches import/export/require with a relative path going up at least one level
// Captures: quote char, the relative path, rest of specifier
const IMPORT_RE = /(['"])((?:\.\.\/)+(?:[^'"]+))\1/g;

/**
 * Given a file path and a relative import specifier, return the #/ alias
 * if the resolved path lands in a different top-level src subfolder.
 * Returns null if no replacement is needed.
 */
function resolveAlias(filePath, specifier) {
  const fileDir = dirname(filePath);
  const absTarget = resolve(fileDir, specifier);

  // Must be inside src/
  const relFromSrc = relative(SRC, absTarget).replace(/\\/g, "/");
  if (relFromSrc.startsWith("..")) return null; // outside src

  // Top-level folder of the target
  const targetTopFolder = relFromSrc.split("/")[0];
  if (!TOP_LEVEL_FOLDERS.has(targetTopFolder)) return null;

  // Top-level folder of the source file
  const relFileSrc = relative(SRC, filePath).replace(/\\/g, "/");
  const sourceTopFolder = relFileSrc.split("/")[0];

  // Only replace cross-folder references
  if (sourceTopFolder === targetTopFolder) return null;

  return `#/${relFromSrc}`;
}

/** Recursively collect .ts/.tsx files */
function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

let totalFiles = 0;
let changedFiles = 0;
let totalReplacements = 0;

for (const filePath of collectFiles(SRC)) {
  const original = readFileSync(filePath, "utf8");
  let replacements = 0;

  const updated = original.replace(IMPORT_RE, (match, quote, specifier) => {
    const alias = resolveAlias(filePath, specifier);
    if (!alias) return match;
    replacements++;
    return `${quote}${alias}${quote}`;
  });

  totalFiles++;

  if (updated !== original) {
    changedFiles++;
    totalReplacements += replacements;
    const rel = relative(ROOT, filePath).replace(/\\/g, "/");
    console.log(`${DRY_RUN ? "[dry-run] " : ""}${rel} - ${replacements} replacement(s)`);
    if (!DRY_RUN) {
      writeFileSync(filePath, updated, "utf8");
    }
  }
}

console.log(
  `\nDone. Scanned ${totalFiles} files, ${DRY_RUN ? "would change" : "changed"} ${changedFiles} file(s) with ${totalReplacements} total replacement(s).`,
);
