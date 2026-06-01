/**
 * Property 2: UI layer domain isolation
 *
 * For any TypeScript source file within `src/components/` or `src/routes/`
 * (excluding test files), scanning all import statements shall yield zero
 * matches against the pattern `#/core/*`.
 *
 * **Validates: Requirements 4.1, 5.2**
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC_DIR = resolve(__dirname, "../..");
const UI_DIRS = [join(SRC_DIR, "components"), join(SRC_DIR, "routes")];

/** Matches test files that should be excluded from boundary checks */
const TEST_FILE_PATTERN = /\/__tests__\/|\.test\.|\.spec\./;

/**
 * Regex to match all forms of TypeScript import statements:
 * - import { X } from "path"
 * - import type { X } from "path"
 * - import X from "path"
 * - import "path"
 * - export { X } from "path"
 * - export type { X } from "path"
 */
const IMPORT_REGEX = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

/**
 * Forbidden import pattern for UI layer — direct domain layer access.
 * UI components must access domain logic through the hooks layer re-exports.
 */
const FORBIDDEN_PATTERN = /^#\/core\//;

/**
 * Recursively collect all .ts/.tsx files from a directory,
 * excluding test files.
 */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !TEST_FILE_PATTERN.test(fullPath.replace(/\\/g, "/"))
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Extract all import paths from a TypeScript file's content.
 */
function extractImportPaths(content: string): string[] {
  const paths: string[] = [];
  const regex = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    paths.push(match[1]);
  }

  return paths;
}

/**
 * Check if an import path violates the UI domain isolation rule.
 */
function isViolatingImport(importPath: string): boolean {
  return FORBIDDEN_PATTERN.test(importPath);
}

describe("Property 2: UI layer domain isolation", () => {
  const uiFiles: string[] = [];

  for (const dir of UI_DIRS) {
    uiFiles.push(...collectTsFiles(dir));
  }

  it("should find UI layer files to test", () => {
    expect(uiFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of uiFiles) {
    const relativePath = filePath.replace(SRC_DIR, "src").replace(/\\/g, "/");

    it(`${relativePath} has no imports from #/core/*`, () => {
      const content = readFileSync(filePath, "utf-8");
      const importPaths = extractImportPaths(content);
      const violations: string[] = [];

      for (const importPath of importPaths) {
        if (isViolatingImport(importPath)) {
          violations.push(importPath);
        }
      }

      expect(
        violations,
        `${relativePath} has forbidden domain imports: ${violations.join(", ")}`,
      ).toEqual([]);
    });
  }
});
