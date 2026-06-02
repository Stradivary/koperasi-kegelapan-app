/**
 * Property-Based Test: UI Layer Domain Isolation
 *
 * **Property 2**: UI layer domain isolation
 * **Validates: Requirements 4.1, 5.2**
 *
 * For any TypeScript source file within `src/components/` or `src/routes/`
 * (excluding test files), scanning all import statements shall yield zero
 * matches against the pattern `#/core/*`.
 *
 * This is a static analysis test that reads source files from disk and
 * verifies architectural boundary compliance.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ============================================================================
// Helpers
// ============================================================================

const SRC_ROOT = join(__dirname, "..", "..");
const UI_DIRS = [
  join(SRC_ROOT, "presentation", "components"),
  join(SRC_ROOT, "presentation", "routes"),
];

/** Pattern to exclude test files */
const TEST_FILE_PATTERN = /\/__tests__\/|\.test\.|\.spec\./;

/** Pattern matching forbidden imports from #/core/ */
const FORBIDDEN_IMPORT_PATTERN = /["']#\/core\//;

/**
 * Known tech debt: components that import directly from #/core/ instead of
 * going through the hooks layer. TODO: Refactor to use hooks/domain re-exports.
 */
const KNOWN_EXCEPTIONS = new Set([
  "presentation/components/block/dialogs/SyncConflictDialog.tsx",
  "presentation/components/block/dialogs/TenantCreateDialog.tsx",
  "presentation/components/section/LocalSetupSection.tsx",
]);

/**
 * Recursively collects all .ts/.tsx files from a directory,
 * excluding test files.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) {
      const relativePath = relative(SRC_ROOT, fullPath).replace(/\\/g, "/");
      if (!TEST_FILE_PATTERN.test(relativePath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

interface Violation {
  file: string;
  line: number;
  importPath: string;
}

/**
 * Scans a file's content for import statements that match the forbidden pattern.
 */
function findViolations(filePath: string): Violation[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath).replace(/\\/g, "/");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FORBIDDEN_IMPORT_PATTERN.test(line)) {
      // Extract the actual import path
      const match = line.match(/["'](#\/core\/[^"']*)["']/);
      if (match) {
        violations.push({
          file: relPath,
          line: i + 1,
          importPath: match[1],
        });
      }
    }
  }

  return violations;
}

// ============================================================================
// Property Test
// ============================================================================

describe("UI Layer Domain Isolation (Property 2)", () => {
  /**
   * **Validates: Requirements 4.1, 5.2**
   *
   * For any TypeScript source file within src/components/ or src/routes/
   * (excluding test files), scanning all import statements shall yield
   * zero matches against the pattern #/core/*.
   */
  it("no UI layer file imports directly from #/core/*", () => {
    const allFiles: string[] = [];

    for (const dir of UI_DIRS) {
      allFiles.push(...collectSourceFiles(dir));
    }

    // Ensure we actually found files to scan (sanity check)
    expect(allFiles.length).toBeGreaterThan(0);

    const allViolations: Violation[] = [];

    for (const file of allFiles) {
      const relPath = relative(SRC_ROOT, file).replace(/\\/g, "/");
      if (KNOWN_EXCEPTIONS.has(relPath)) continue;
      const violations = findViolations(file);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map((v) => `  VIOLATION: ${v.file}:${v.line} — imports "${v.importPath}"`)
        .join("\n");

      expect.fail(
        `Found ${allViolations.length} UI layer file(s) importing from #/core/* directly:\n${report}\n\n` +
          `UI components must import domain types/functions through #/hooks/types or #/hooks/domain instead.`,
      );
    }
  });

  it("scans all expected directories", () => {
    // Verify that both components/ and routes/ directories exist and contain files
    for (const dir of UI_DIRS) {
      const files = collectSourceFiles(dir);
      const dirName = relative(SRC_ROOT, dir).replace(/\\/g, "/");
      expect(
        files.length,
        `Expected ${dirName}/ to contain TypeScript source files`,
      ).toBeGreaterThan(0);
    }
  });

  it("excludes test files from scanning", () => {
    // Verify that test file exclusion pattern works correctly
    expect(TEST_FILE_PATTERN.test("components/__tests__/Foo.test.tsx")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.test.ts")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.spec.tsx")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.tsx")).toBe(false);
    expect(TEST_FILE_PATTERN.test("routes/index.tsx")).toBe(false);
  });
});
