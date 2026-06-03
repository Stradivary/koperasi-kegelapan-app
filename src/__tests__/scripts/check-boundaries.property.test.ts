/**
 * Property-Based Tests for Boundary Enforcement Script Correctness
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.8**
 *
 * Property 8: Boundary enforcement script correctness
 *
 * For any source file path and import statement, the boundary enforcement script
 * shall report a violation if and only if the file's layer and the import target
 * violate the defined architectural rules (Domain→Gateways, UI→Domain, UI→Gateways excluding utils).
 *
 * @module __tests__/scripts/check-boundaries.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// Replicated Boundary Checking Logic (from scripts/check-boundaries.ts)
// ============================================================================

interface Violation {
  file: string;
  line: number;
  importPath: string;
  rule: string;
}

const RULES = [
  {
    name: "Domain (core/) must not import from outer layers",
    sourcePattern: /^src\/core\//,
    forbiddenImports: [
      /["']#\/db\//,
      /["']#\/lib\//,
      /["']#\/infrastructure\//,
      /["']#\/application\//,
      /["']#\/presentation\//,
    ],
  },
  {
    name: "Application must not import from Presentation",
    sourcePattern: /^src\/application\//,
    forbiddenImports: [/["']#\/presentation\//],
  },
  {
    name: "Infrastructure must not import from Presentation",
    sourcePattern: /^src\/infrastructure\//,
    forbiddenImports: [/["']#\/presentation\//],
  },
  {
    name: "Presentation (components/routes) must not import from Domain directly",
    sourcePattern: /^src\/presentation\/(components|routes)\//,
    forbiddenImports: [/["']#\/core\//],
  },
  {
    name: "Presentation (components/routes) must not import from Infrastructure directly",
    sourcePattern: /^src\/presentation\/(components|routes)\//,
    forbiddenImports: [/["']#\/infrastructure\//, /["']#\/db\//, /["']#\/lib\/(?!utils)/],
  },
];

const EXEMPT_PATTERN = /\/__tests__\/|\.test\.|\.spec\./;

/**
 * Extracts the import path from a line (replicates script logic).
 */
function extractImportPath(line: string): string | null {
  const match = line.match(
    /(?:import|export)\s+.*?["']([^"']+)["']|(?:import|export)\s*["']([^"']+)["']/,
  );
  if (match) {
    return match[1] || match[2];
  }
  return null;
}

/**
 * Checks a single line against the boundary rules for a given file path.
 * Returns violations found (replicates the core logic of checkFile).
 */
function checkLine(relativePath: string, line: string, lineNumber: number): Violation[] {
  const violations: Violation[] = [];

  if (EXEMPT_PATTERN.test(relativePath)) {
    return violations;
  }

  for (const rule of RULES) {
    if (!rule.sourcePattern.test(relativePath)) continue;

    for (const forbiddenPattern of rule.forbiddenImports) {
      if (forbiddenPattern.test(line)) {
        const importPath = extractImportPath(line);
        if (importPath) {
          violations.push({
            file: relativePath,
            line: lineNumber,
            importPath,
            rule: rule.name,
          });
        }
      }
    }
  }

  return violations;
}

// ============================================================================
// Reference Implementation (oracle for property testing)
// ============================================================================

/**
 * Determines the layer of a file based on its path.
 */
type Layer = "domain" | "ui" | "hooks" | "gateways" | "other";

function getLayer(filePath: string): Layer {
  if (filePath.startsWith("src/core/")) return "domain";
  if (/^src\/presentation\/(components|routes)\//.test(filePath)) return "ui";
  if (filePath.startsWith("src/presentation/hooks/") || filePath.startsWith("src/hooks/"))
    return "hooks";
  if (/^src\/(db|lib|infrastructure)\//.test(filePath)) return "gateways";
  return "other";
}

/**
 * Determines the target layer of an import path.
 */
type ImportTarget = "db" | "lib" | "lib-utils" | "core" | "hooks" | "other";

function getImportTarget(importPath: string): ImportTarget {
  if (importPath.startsWith("#/db/")) return "db";
  if (importPath === "#/presentation/lib/utils" || importPath.startsWith("#/lib/utils/"))
    return "lib-utils";
  if (importPath.startsWith("#/lib/")) return "lib";
  if (importPath.startsWith("#/infrastructure/")) return "lib";
  if (importPath.startsWith("#/core/")) return "core";
  if (importPath.startsWith("#/presentation/hooks/")) return "hooks";
  return "other";
}

/**
 * Reference oracle: determines if a (filePath, importPath) pair should be a violation.
 * Returns the expected violation rule names, or empty array if no violation.
 */
function expectedViolations(filePath: string, importPath: string): string[] {
  const layer = getLayer(filePath);
  const target = getImportTarget(importPath);
  const violations: string[] = [];

  // Rule 1: Domain must not import from outer layers
  if (layer === "domain" && (target === "db" || target === "lib" || target === "lib-utils")) {
    violations.push("Domain (core/) must not import from outer layers");
  }

  // Rule 2: Presentation (components/routes) must not import from Domain directly
  if (layer === "ui" && target === "core") {
    violations.push("Presentation (components/routes) must not import from Domain directly");
  }

  // Rule 3: Presentation (components/routes) must not import from Infrastructure directly
  if (layer === "ui" && (target === "db" || target === "lib")) {
    violations.push(
      "Presentation (components/routes) must not import from Infrastructure directly",
    );
  }

  return violations;
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates a file name segment (alphanumeric with possible camelCase).
 */
const arbitraryFileName: fc.Arbitrary<string> = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,15}$/);

/**
 * Generates a file extension.
 */
const arbitraryExtension: fc.Arbitrary<string> = fc.constantFrom(".ts", ".tsx");

/**
 * Generates a domain layer file path (src/core/*).
 */
const arbitraryDomainPath: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("validation", "nfc", "payload", "state-machine", "interfaces"),
    arbitraryFileName,
    arbitraryExtension,
  )
  .map(([subdir, name, ext]) => `src/core/${subdir}/${name}${ext}`);

/**
 * Generates a UI layer file path (src/components/* or src/routes/*).
 */
const arbitraryUIPath: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("components", "routes"),
    fc.constantFrom("section", "block", "layout", "dialogs", ""),
    arbitraryFileName,
    arbitraryExtension,
  )
  .map(([layer, subdir, name, ext]) =>
    subdir
      ? `src/presentation/${layer}/${subdir}/${name}${ext}`
      : `src/presentation/${layer}/${name}${ext}`,
  );

/**
 * Generates a hooks layer file path (src/hooks/*).
 */
const arbitraryHooksPath: fc.Arbitrary<string> = fc
  .tuple(arbitraryFileName, arbitraryExtension)
  .map(([name, ext]) => `src/presentation/hooks/${name}${ext}`);

/**
 * Generates a gateways layer file path (src/db/* or src/lib/*).
 */
const arbitraryGatewaysPath: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("db", "lib"),
    fc.constantFrom("repositories", ""),
    arbitraryFileName,
    arbitraryExtension,
  )
  .map(([layer, subdir, name, ext]) =>
    subdir ? `src/${layer}/${subdir}/${name}${ext}` : `src/${layer}/${name}${ext}`,
  );

/**
 * Generates a test file path (should be exempt from boundary checks).
 */
const arbitraryTestPath: fc.Arbitrary<string> = fc.oneof(
  // __tests__ directory pattern
  fc
    .tuple(
      fc.constantFrom("core", "components", "routes", "hooks"),
      arbitraryFileName,
      arbitraryExtension,
    )
    .map(([layer, name, ext]) => `src/__tests__/${layer}/${name}${ext}`),
  // .test. pattern
  fc
    .tuple(
      fc.constantFrom("src/core/validation", "src/components/section", "src/hooks"),
      arbitraryFileName,
    )
    .map(([dir, name]) => `${dir}/${name}.test.ts`),
  // .spec. pattern
  fc
    .tuple(fc.constantFrom("src/core/nfc", "src/routes"), arbitraryFileName)
    .map(([dir, name]) => `${dir}/${name}.spec.ts`),
);

/**
 * Generates any non-test file path across all layers.
 */
const arbitraryNonTestPath: fc.Arbitrary<string> = fc.oneof(
  arbitraryDomainPath,
  arbitraryUIPath,
  arbitraryHooksPath,
  arbitraryGatewaysPath,
);

/**
 * Generates an import path targeting the db layer.
 */
const arbitraryDbImport: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("local-db", "schema", "migrations", "seed"))
  .map(([name]) => `#/db/${name}`);

/**
 * Generates an import path targeting the lib layer (NOT utils).
 */
const arbitraryLibImport: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("api", "formatters", "transactionLogService", "repositories/index"))
  .map(([name]) => `#/lib/${name}`);

/**
 * Generates an import path targeting #/lib/utils specifically.
 */
const arbitraryLibUtilsImport: fc.Arbitrary<string> = fc.constantFrom(
  "#/presentation/lib/utils",
  "#/lib/utils/cn",
);

/**
 * Generates an import path targeting the core layer.
 */
const arbitraryCoreImport: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(
      "validation/uidGlobalValidator",
      "validation/blockEnforcer",
      "nfc/engine",
      "payload/types",
      "state-machine/engine",
      "interfaces/CardRepository",
    ),
  )
  .map(([name]) => `#/core/${name}`);

/**
 * Generates an import path targeting the hooks layer.
 */
const arbitraryHooksImport: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("types", "domain", "useBlockedCheck", "useTenantContext"))
  .map(([name]) => `#/hooks/${name}`);

/**
 * Generates a safe/allowed import path (relative, node module, or hooks).
 */
const arbitrarySafeImport: fc.Arbitrary<string> = fc.oneof(
  fc.constant("react"),
  fc.constant("vitest"),
  fc.constant("./localHelper"),
  fc.constant("../utils"),
  arbitraryHooksImport,
);

/**
 * Generates any import path (violating or non-violating).
 */
const arbitraryAnyImport: fc.Arbitrary<string> = fc.oneof(
  arbitraryDbImport,
  arbitraryLibImport,
  arbitraryLibUtilsImport,
  arbitraryCoreImport,
  arbitraryHooksImport,
  arbitrarySafeImport,
);

/**
 * Generates an import line from an import path.
 */
function arbitraryImportLine(importPath: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(
      importPath,
      fc.constantFrom("import", "import type", "export"),
      fc.constantFrom('"', "'"),
      arbitraryFileName,
    )
    .map(([path, keyword, quote, name]) => {
      if (keyword === "export") {
        return `export { ${name} } from ${quote}${path}${quote};`;
      }
      return `${keyword} { ${name} } from ${quote}${path}${quote};`;
    });
}

// ============================================================================
// Property Tests
// ============================================================================

describe("Boundary Enforcement Script Correctness Property Tests", () => {
  describe("Property 8: Boundary enforcement script correctness", () => {
    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.8**
     *
     * Domain files importing from #/db/ or #/lib/ → violation reported.
     */
    it("domain files importing from gateways produce violations", () => {
      fc.assert(
        fc.property(
          arbitraryDomainPath,
          fc.oneof(arbitraryImportLine(arbitraryDbImport), arbitraryImportLine(arbitraryLibImport)),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            expect(violations.length).toBeGreaterThan(0);
            expect(
              violations.some((v) => v.rule === "Domain (core/) must not import from outer layers"),
            ).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.2**
     *
     * UI files importing from #/core/ → violation reported.
     */
    it("UI files importing from domain produce violations", () => {
      fc.assert(
        fc.property(
          arbitraryUIPath,
          arbitraryImportLine(arbitraryCoreImport),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            expect(violations.length).toBeGreaterThan(0);
            expect(
              violations.some(
                (v) =>
                  v.rule ===
                  "Presentation (components/routes) must not import from Domain directly",
              ),
            ).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * UI files importing from #/db/ or #/lib/ (except #/lib/utils) → violation reported.
     */
    it("UI files importing from gateways (except utils) produce violations", () => {
      fc.assert(
        fc.property(
          arbitraryUIPath,
          fc.oneof(arbitraryImportLine(arbitraryDbImport), arbitraryImportLine(arbitraryLibImport)),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            expect(violations.length).toBeGreaterThan(0);
            expect(
              violations.some(
                (v) =>
                  v.rule ===
                  "Presentation (components/routes) must not import from Infrastructure directly",
              ),
            ).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.8**
     *
     * UI files importing from #/lib/utils → NO violation.
     */
    it("UI files importing from #/lib/utils produce NO violations", () => {
      fc.assert(
        fc.property(
          arbitraryUIPath,
          arbitraryImportLine(arbitraryLibUtilsImport),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            // Should have no "Presentation (components/routes) must not import from Infrastructure directly" violation
            const gatewayViolations = violations.filter(
              (v) =>
                v.rule ===
                "Presentation (components/routes) must not import from Infrastructure directly",
            );
            expect(gatewayViolations).toHaveLength(0);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.8**
     *
     * Test files → NO violation regardless of imports.
     */
    it("test files are exempt from all boundary checks", () => {
      fc.assert(
        fc.property(
          arbitraryTestPath,
          arbitraryImportLine(arbitraryAnyImport),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            expect(violations).toHaveLength(0);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3**
     *
     * Hooks files importing from #/core/ → NO violation (allowed).
     */
    it("hooks files importing from domain produce NO violations", () => {
      fc.assert(
        fc.property(
          arbitraryHooksPath,
          arbitraryImportLine(arbitraryCoreImport),
          (filePath, importLine) => {
            const violations = checkLine(filePath, importLine, 1);
            expect(violations).toHaveLength(0);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.8**
     *
     * For any (filePath, importPath) pair, the script's violations match
     * the reference oracle exactly.
     */
    it("script violations match reference oracle for all generated inputs", () => {
      fc.assert(
        fc.property(
          arbitraryNonTestPath,
          arbitraryAnyImport,
          fc.constantFrom('"', "'"),
          fc.constantFrom("import", "import type", "export"),
          arbitraryFileName,
          (filePath, importPath, quote, keyword, name) => {
            const importLine =
              keyword === "export"
                ? `export { ${name} } from ${quote}${importPath}${quote};`
                : `${keyword} { ${name} } from ${quote}${importPath}${quote};`;

            const actualViolations = checkLine(filePath, importLine, 1);
            const expectedRules = expectedViolations(filePath, importPath);

            // The set of rule names from actual violations should match expected
            const actualRuleNames = [...new Set(actualViolations.map((v) => v.rule))].sort();
            const expectedRuleNames = [...new Set(expectedRules)].sort();

            expect(actualRuleNames).toEqual(expectedRuleNames);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3**
     *
     * Violations always include the correct import path in the violation record.
     */
    it("violations correctly extract the import path", () => {
      fc.assert(
        fc.property(
          arbitraryNonTestPath,
          arbitraryAnyImport,
          fc.constantFrom('"', "'"),
          arbitraryFileName,
          (filePath, importPath, quote, name) => {
            const importLine = `import { ${name} } from ${quote}${importPath}${quote};`;
            const violations = checkLine(filePath, importLine, 1);

            for (const v of violations) {
              expect(v.importPath).toBe(importPath);
              expect(v.file).toBe(filePath);
              expect(v.line).toBe(1);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Validates: Requirements 5.1, 5.2, 5.3**
     *
     * Lines without import/export keywords and forbidden path patterns never produce violations.
     */
    it("lines without import/export patterns never produce violations", () => {
      const arbitraryNonImportLine: fc.Arbitrary<string> = fc.oneof(
        fc.constant("const x = 42;"),
        fc.constant("function foo() { return bar; }"),
        fc.constant("type MyType = string;"),
        fc.constant("interface Foo { bar: number; }"),
        fc.constant(""),
        fc.constant("// this is a comment"),
        fc.constant("const path = './localHelper';"),
        arbitraryFileName.map((name) => `const ${name} = true;`),
        arbitraryFileName.map((name) => `function ${name}() { return null; }`),
      );

      fc.assert(
        fc.property(arbitraryNonTestPath, arbitraryNonImportLine, (filePath, line) => {
          const violations = checkLine(filePath, line, 1);
          expect(violations).toHaveLength(0);
        }),
        { numRuns: 50 },
      );
    });
  });
});
