/**
 * Property-Based Test: UI Layer Gateway Isolation
 *
 * **Property 3**: UI layer gateway isolation
 * **Validates: Requirements 4.2, 5.3**
 *
 * For any TypeScript source file within `src/components/` or `src/routes/`
 * (excluding test files), scanning all import statements shall yield zero
 * matches against patterns `#/db/*` or `#/lib/*` except for the exempted
 * `#/lib/utils` path.
 *
 * This is a static analysis test that reads source files from disk and
 * verifies architectural boundary compliance.
 *
 * @module __tests__/architecture/ui-gateway-isolation.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ============================================================================
// Helpers
// ============================================================================

const SRC_ROOT = join(__dirname, "..", "..");
const UI_DIRS = [join(SRC_ROOT, "components"), join(SRC_ROOT, "routes")];

/** Pattern to exclude test files */
const TEST_FILE_PATTERN = /\/__tests__\/|\.test\.|\.spec\./;

/** Forbidden import patterns for UI → Gateways (except #/lib/utils) */
const FORBIDDEN_PATTERNS = [
  { pattern: /^#\/db\//, description: "#/db/*" },
  { pattern: /^#\/lib\/(?!utils)/, description: "#/lib/* (except #/lib/utils)" },
];

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
      if (entry === "__tests__" || entry === "node_modules") continue;
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

/**
 * Extracts all import paths from a TypeScript source file content.
 * Matches static imports, type imports, side-effect imports, and dynamic imports.
 */
function extractImportPaths(content: string): { path: string; line: number }[] {
  const imports: { path: string; line: number }[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: import ... from "path" or import ... from 'path'
    const fromMatch = line.match(/from\s+["']([^"']+)["']/);
    if (fromMatch) {
      imports.push({ path: fromMatch[1], line: i + 1 });
      continue;
    }

    // Match: import "path" or import 'path' (side-effect imports)
    const sideEffectMatch = line.match(/^\s*import\s+["']([^"']+)["']/);
    if (sideEffectMatch) {
      imports.push({ path: sideEffectMatch[1], line: i + 1 });
      continue;
    }

    // Match: import("path") (dynamic imports)
    const dynamicMatch = line.match(/import\(\s*["']([^"']+)["']\s*\)/);
    if (dynamicMatch) {
      imports.push({ path: dynamicMatch[1], line: i + 1 });
    }
  }

  return imports;
}

/**
 * Checks if an import path matches any forbidden gateway pattern.
 */
function matchesForbiddenPattern(importPath: string): { matches: boolean; pattern?: string } {
  for (const { pattern, description } of FORBIDDEN_PATTERNS) {
    if (pattern.test(importPath)) {
      return { matches: true, pattern: description };
    }
  }
  return { matches: false };
}

interface Violation {
  file: string;
  line: number;
  importPath: string;
  pattern: string;
}

/**
 * Scans a file for forbidden gateway imports.
 */
function findViolations(filePath: string): Violation[] {
  const content = readFileSync(filePath, "utf-8");
  const imports = extractImportPaths(content);
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath).replace(/\\/g, "/");

  for (const imp of imports) {
    const result = matchesForbiddenPattern(imp.path);
    if (result.matches) {
      violations.push({
        file: relPath,
        line: imp.line,
        importPath: imp.path,
        pattern: result.pattern!,
      });
    }
  }

  return violations;
}

// ============================================================================
// Property Test (Static Analysis of Actual Codebase)
// ============================================================================

describe("UI Layer Gateway Isolation (Property 3)", () => {
  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * For any TypeScript source file within src/components/ or src/routes/
   * (excluding test files), scanning all import statements shall yield
   * zero matches against patterns #/db/* or #/lib/* except for the
   * exempted #/lib/utils path.
   */
  it("no UI layer file imports from gateways (except #/lib/utils)", () => {
    const allFiles: string[] = [];

    for (const dir of UI_DIRS) {
      allFiles.push(...collectSourceFiles(dir));
    }

    // Sanity check: ensure we found files to scan
    expect(allFiles.length).toBeGreaterThan(0);

    const allViolations: Violation[] = [];

    for (const file of allFiles) {
      const violations = findViolations(file);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map(
          (v) =>
            `  VIOLATION: ${v.file}:${v.line} — imports "${v.importPath}" (forbidden: ${v.pattern})`,
        )
        .join("\n");

      expect.fail(
        `Found ${allViolations.length} UI layer file(s) importing from gateways:\n${report}\n\n` +
          `UI components must not import from #/db/* or #/lib/* (except #/lib/utils).`,
      );
    }
  });

  it("scans all expected directories", () => {
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
    expect(TEST_FILE_PATTERN.test("components/__tests__/Foo.test.tsx")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.test.ts")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.spec.tsx")).toBe(true);
    expect(TEST_FILE_PATTERN.test("components/block/Foo.tsx")).toBe(false);
    expect(TEST_FILE_PATTERN.test("routes/index.tsx")).toBe(false);
  });
});

// ============================================================================
// Property-Based Tests (Generative Verification of Detection Logic)
// ============================================================================

describe("UI Gateway Isolation Detection Logic (Property 3 - Generative)", () => {
  /**
   * Generators for property-based testing of the detection logic.
   */
  const arbitraryDbImport = fc
    .constantFrom("local-db", "schema", "migrations", "seed")
    .map((name) => `#/db/${name}`);

  const arbitraryLibImport = fc
    .constantFrom("api", "formatters", "transactionLogService", "repositories/index")
    .map((name) => `#/lib/${name}`);

  const arbitraryLibUtilsImport = fc.constantFrom("#/lib/utils", "#/lib/utils/cn");

  const arbitrarySafeImport = fc.oneof(
    fc.constant("react"),
    fc.constant("vitest"),
    fc.constant("./localHelper"),
    fc.constant("../utils"),
    fc.constantFrom("#/hooks/types", "#/hooks/domain", "#/hooks/useBlockedCheck"),
  );

  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * Any import from #/db/* is detected as a violation.
   */
  it("detects #/db/* imports as violations", () => {
    fc.assert(
      fc.property(arbitraryDbImport, (importPath) => {
        const result = matchesForbiddenPattern(importPath);
        expect(result.matches).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * Any import from #/lib/* (except #/lib/utils) is detected as a violation.
   */
  it("detects #/lib/* imports (except utils) as violations", () => {
    fc.assert(
      fc.property(arbitraryLibImport, (importPath) => {
        const result = matchesForbiddenPattern(importPath);
        expect(result.matches).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * Imports from #/lib/utils are NOT detected as violations (exempted).
   */
  it("allows #/lib/utils imports (no violation)", () => {
    fc.assert(
      fc.property(arbitraryLibUtilsImport, (importPath) => {
        const result = matchesForbiddenPattern(importPath);
        expect(result.matches).toBe(false);
      }),
      { numRuns: 10 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * Safe imports (hooks, relative, node modules) are NOT detected as violations.
   */
  it("allows safe imports (hooks, relative, node modules)", () => {
    fc.assert(
      fc.property(arbitrarySafeImport, (importPath) => {
        const result = matchesForbiddenPattern(importPath);
        expect(result.matches).toBe(false);
      }),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 5.3**
   *
   * For any generated forbidden import, the detection logic correctly identifies it.
   * For any generated safe import, the detection logic correctly allows it.
   */
  it("correctly classifies all generated imports", () => {
    const arbitraryForbiddenImport = fc.oneof(arbitraryDbImport, arbitraryLibImport);
    const arbitraryAllowedImport = fc.oneof(arbitraryLibUtilsImport, arbitrarySafeImport);

    fc.assert(
      fc.property(
        fc.oneof(
          arbitraryForbiddenImport.map((p) => ({ path: p, shouldViolate: true })),
          arbitraryAllowedImport.map((p) => ({ path: p, shouldViolate: false })),
        ),
        ({ path, shouldViolate }) => {
          const result = matchesForbiddenPattern(path);
          expect(result.matches).toBe(shouldViolate);
        },
      ),
      { numRuns: 50 },
    );
  });
});
