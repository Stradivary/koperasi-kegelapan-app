/**
 * Property 9: Repository interface purity
 *
 * For any TypeScript source file within `src/core/interfaces/`, all import
 * statements shall resolve exclusively to paths within `src/core/`
 * (the interfaces themselves have zero outward dependencies).
 *
 * Validates: Requirements 2.5
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const INTERFACES_DIR = resolve(__dirname, "../../../core/interfaces");

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
 * Forbidden import patterns - anything outside src/core/.
 * These indicate outward dependencies that violate interface purity.
 */
const FORBIDDEN_PATTERNS = [
  /^#\/db\//, // Database layer
  /^#\/lib\//, // Library/gateway layer
  /^#\/hooks\//, // Hooks layer
  /^#\/components\//, // UI layer
  /^#\/routes\//, // Routes layer
  /^#\/server\//, // Server layer
  /^@\//, // Alias that might point outside core
];

/**
 * Allowed import patterns for interface files:
 * - Relative imports within the same directory (e.g., "./types")
 * - Relative imports within src/core/ (e.g., "../payload/types")
 * - #/core/* alias imports (still within domain layer)
 */
function isAllowedImport(importPath: string): boolean {
  // Relative imports starting with "./" or "../" are allowed
  // as long as they stay within src/core/ (we check forbidden patterns below)
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return true;
  }

  // #/core/* imports are allowed (still within domain layer)
  if (importPath.startsWith("#/core/")) {
    return true;
  }

  // Any other path alias is forbidden
  return false;
}

function isForbiddenImport(importPath: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(importPath));
}

describe("Property 9: Repository interface purity", () => {
  const tsFiles = readdirSync(INTERFACES_DIR).filter((f) => f.endsWith(".ts"));

  it("should find interface files to test", () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  for (const file of tsFiles) {
    it(`${file} has zero outward imports (only imports from within src/core/)`, () => {
      const filePath = join(INTERFACES_DIR, file);
      const content = readFileSync(filePath, "utf-8");
      const violations: string[] = [];

      let match: RegExpExecArray | null;
      const regex = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);

      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];

        if (isForbiddenImport(importPath)) {
          violations.push(importPath);
        } else if (!isAllowedImport(importPath)) {
          violations.push(importPath);
        }
      }

      expect(
        violations,
        `${file} has forbidden imports outside src/core/: ${violations.join(", ")}`,
      ).toEqual([]);
    });
  }
});
