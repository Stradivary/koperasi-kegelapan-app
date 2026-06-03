import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

// Exempt test files from boundary checks
const EXEMPT_PATTERN = /\/__tests__\/|\.test\.|\.spec\./;

// Known tech debt: files that violate boundaries but are accepted for now.
//  Refactor these to respect layer boundaries.
const KNOWN_EXCEPTIONS: Record<string, string[]> = {
  "src/core/sync/conflictResolver.ts": [
    "#/infrastructure/persistence/dexie/localDb",
    "#/application/sync/syncPull.usecase",
  ],
  "src/presentation/components/block/dialogs/SyncConflictDialog.tsx": [
    "#/core/validation/slugValidation",
  ],
  "src/presentation/components/block/dialogs/TenantCreateDialog.tsx": [
    "#/core/validation/slugValidation",
  ],
  "src/presentation/components/section/LocalSetupSection.tsx": ["#/core/validation/slugValidation"],
  "src/presentation/components/block/NfcTapArea.tsx": ["#/infrastructure/device/haptics"],
};

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.startsWith(".") || entry === "node_modules") continue;
      files.push(...walkDir(fullPath));
    } else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractImportPath(line: string): string | null {
  // Match: import ... from "path" or import "path" or export ... from "path"
  const match = line.match(
    /(?:import|export)\s+.*?["']([^"']+)["']|(?:import|export)\s*["']([^"']+)["']/,
  );
  if (match) {
    return match[1] || match[2];
  }
  return null;
}

function checkFile(filePath: string, rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const relativePath = relative(rootDir, filePath).replace(/\\/g, "/");

  // Skip exempt files (test files)
  if (EXEMPT_PATTERN.test(relativePath)) {
    return violations;
  }

  const exceptions = KNOWN_EXCEPTIONS[relativePath] ?? [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check each rule
    for (const rule of RULES) {
      // Does this file match the rule's source pattern?
      if (!rule.sourcePattern.test(relativePath)) continue;

      // Check each forbidden import pattern against this line
      for (const forbiddenPattern of rule.forbiddenImports) {
        if (forbiddenPattern.test(line)) {
          const importPath = extractImportPath(line);
          if (importPath && !exceptions.includes(importPath)) {
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
  }

  return violations;
}

function main(): void {
  const rootDir = join(import.meta.dirname, "..");
  const srcDir = join(rootDir, "src");

  const files = walkDir(srcDir);
  const allViolations: Violation[] = [];

  for (const file of files) {
    const violations = checkFile(file, rootDir);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error(`\nFound ${allViolations.length} boundary violation(s):\n`);
    for (const v of allViolations) {
      console.error(`VIOLATION: ${v.file}:${v.line} - ${v.rule} - imports "${v.importPath}"`);
    }
    console.error("");
    process.exit(1);
  } else {
    console.log("✓ No boundary violations found.");
    process.exit(0);
  }
}

main();
