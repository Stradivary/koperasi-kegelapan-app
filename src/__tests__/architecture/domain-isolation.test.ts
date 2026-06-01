/**
 * Property-Based Tests for Domain Layer Import Isolation
 *
 * **Validates: Requirements 1.1, 5.1**
 *
 * Property 1: Domain layer import isolation
 *
 * For any TypeScript source file within `src/core/`, scanning all import statements
 * shall yield zero matches against patterns `#/db/*`, `#/lib/api`, `#/lib/formatters`,
 * or `#/lib/transactionLogService`.
 *
 * This is a static analysis test that reads files from disk and verifies
 * the architectural boundary constraint holds for ALL domain layer files.
 *
 * @module __tests__/architecture/domain-isolation.test
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Recursively finds all .ts/.tsx files in a directory, excluding test files.
 */
function findSourceFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip __tests__ directories
      if (entry.name === "__tests__" || entry.name === "node_modules") {
        continue;
      }
      results.push(...findSourceFiles(fullPath));
    } else if (entry.isFile()) {
      // Include .ts and .tsx files, exclude test files
      const isTypeScript = entry.name.endsWith(".ts") || entry.name.endsWith(".tsx");
      const isTestFile = entry.name.includes(".test.") || entry.name.includes(".spec.");

      if (isTypeScript && !isTestFile) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Extracts all import paths from a TypeScript source file content.
 * Matches both static imports and dynamic imports.
 *
 * Patterns matched:
 * - import ... from "path"
 * - import ... from 'path'
 * - import "path"
 * - import 'path'
 * - import("path")
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

// ============================================================================
// Forbidden Import Patterns for Domain Layer
// ============================================================================

/**
 * Patterns that are FORBIDDEN in the domain layer (src/core/).
 * These represent outward dependencies that violate the dependency rule.
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /^#\/db\//, description: "#/db/*" },
  { pattern: /^#\/lib\/api/, description: "#/lib/api" },
  { pattern: /^#\/lib\/formatters/, description: "#/lib/formatters" },
  { pattern: /^#\/lib\/transactionLogService/, description: "#/lib/transactionLogService" },
];

/**
 * Checks if an import path matches any forbidden pattern.
 */
function matchesForbiddenPattern(importPath: string): { matches: boolean; pattern?: string } {
  for (const { pattern, description } of FORBIDDEN_PATTERNS) {
    if (pattern.test(importPath)) {
      return { matches: true, pattern: description };
    }
  }
  return { matches: false };
}

// ============================================================================
// Property Test
// ============================================================================

describe("Domain Layer Import Isolation Property Tests", () => {
  /**
   * **Validates: Requirements 1.1, 5.1**
   *
   * Property 1: Domain layer import isolation
   *
   * For any TypeScript source file within src/core/, scanning all import statements
   * shall yield zero matches against patterns #/db/*, #/lib/api, #/lib/formatters,
   * or #/lib/transactionLogService.
   */
  it("Property 1: No domain layer file imports from forbidden infrastructure modules", () => {
    const coreDir = path.resolve(__dirname, "../../core");
    const sourceFiles = findSourceFiles(coreDir);

    // Ensure we actually found files to test (sanity check)
    expect(sourceFiles.length).toBeGreaterThan(0);

    const violations: { file: string; line: number; importPath: string; pattern: string }[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = extractImportPaths(content);

      for (const imp of imports) {
        const result = matchesForbiddenPattern(imp.path);
        if (result.matches) {
          const relativePath = path.relative(path.resolve(__dirname, "../.."), filePath);
          violations.push({
            file: relativePath,
            line: imp.line,
            importPath: imp.path,
            pattern: result.pattern!,
          });
        }
      }
    }

    // Report all violations with clear messages
    if (violations.length > 0) {
      const violationMessages = violations.map(
        (v) =>
          `  VIOLATION: ${v.file}:${v.line} — imports "${v.importPath}" (forbidden: ${v.pattern})`,
      );
      expect.fail(
        `Domain layer import isolation violated!\n\n` +
          `Found ${violations.length} forbidden import(s) in src/core/:\n` +
          `${violationMessages.join("\n")}\n\n` +
          `The domain layer must not import from infrastructure modules.`,
      );
    }
  });

  it("Property 1: All domain layer files are scanned (coverage check)", () => {
    const coreDir = path.resolve(__dirname, "../../core");
    const sourceFiles = findSourceFiles(coreDir);

    // Verify we're scanning a reasonable number of files
    // The domain layer should have multiple subdirectories with source files
    expect(sourceFiles.length).toBeGreaterThan(5);

    // Verify we're finding files in expected subdirectories
    const relativePaths = sourceFiles.map((f) => path.relative(coreDir, f));
    const directories = new Set(relativePaths.map((p) => p.split(path.sep)[0]));

    // Domain layer should have at least these subdirectories
    expect(directories.has("validation")).toBe(true);
    expect(directories.has("nfc")).toBe(true);
    expect(directories.has("payload")).toBe(true);
  });

  it("Property 1: Import extraction correctly identifies all import forms", () => {
    // Verify our import extraction handles all TypeScript import patterns
    const testContent = `
import { something } from "#/db/local-db";
import type { Card } from "#/lib/api";
import "#/lib/formatters";
import { log } from "#/lib/transactionLogService";
import { ok } from "#/core/interfaces/types";
import { helper } from "../interfaces/CardRepository";
const mod = await import("#/db/other");
`;

    const imports = extractImportPaths(testContent);
    const paths = imports.map((i) => i.path);

    expect(paths).toContain("#/db/local-db");
    expect(paths).toContain("#/lib/api");
    expect(paths).toContain("#/lib/formatters");
    expect(paths).toContain("#/lib/transactionLogService");
    expect(paths).toContain("#/core/interfaces/types");
    expect(paths).toContain("../interfaces/CardRepository");
    expect(paths).toContain("#/db/other");
  });

  it("Property 1: Forbidden pattern matching is correct", () => {
    // Forbidden paths
    expect(matchesForbiddenPattern("#/db/local-db").matches).toBe(true);
    expect(matchesForbiddenPattern("#/db/schema").matches).toBe(true);
    expect(matchesForbiddenPattern("#/lib/api").matches).toBe(true);
    expect(matchesForbiddenPattern("#/lib/api/client").matches).toBe(true);
    expect(matchesForbiddenPattern("#/lib/formatters").matches).toBe(true);
    expect(matchesForbiddenPattern("#/lib/formatters/date").matches).toBe(true);
    expect(matchesForbiddenPattern("#/lib/transactionLogService").matches).toBe(true);

    // Allowed paths (should NOT match)
    expect(matchesForbiddenPattern("#/core/interfaces/types").matches).toBe(false);
    expect(matchesForbiddenPattern("../interfaces/CardRepository").matches).toBe(false);
    expect(matchesForbiddenPattern("#/lib/utils").matches).toBe(false);
    expect(matchesForbiddenPattern("#/lib/repositories").matches).toBe(false);
    expect(matchesForbiddenPattern("vitest").matches).toBe(false);
    expect(matchesForbiddenPattern("node:fs").matches).toBe(false);
  });
});
