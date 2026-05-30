#!/usr/bin/env node
/**
 * compact-sonar.mjs
 *
 * Compacts sonar.scan.json into AI-friendly chunks.
 *
 * Output modes:
 *   --mode=summary     (default) one JSON with stats + grouped issues
 *   --mode=by-rule     one file per rule, each issue stripped to essentials
 *   --mode=by-file     one file per source file
 *   --mode=by-severity one file per severity (CRITICAL / MAJOR / MINOR)
 *
 * Usage:
 *   node scripts/compact-sonar.mjs
 *   node scripts/compact-sonar.mjs --mode=by-rule --out=.sonar-compact
 *   node scripts/compact-sonar.mjs --mode=by-file --input=sonar.scan.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const MODE = args.mode ?? "summary";
const INPUT = resolve(args.input ?? "sonar.scan.json");
const OUT_DIR = resolve(args.out ?? ".sonar-compact");

// ── Rule descriptions (human-readable, saves AI from looking them up) ─────────
const RULE_LABELS = {
  "typescript:S6759": "React props should be read-only (Readonly<Props>)",
  "typescript:S7735": "Avoid using index as key in lists",
  "typescript:S2933": "Fields that are only assigned in constructor should be readonly",
  "typescript:S4325": "Type assertions should not be redundant",
  "typescript:S4144": "Functions should not have identical implementations",
  "typescript:S4165": "Assignments should not be redundant",
  "typescript:S6571": 'Avoid using "any" type',
  "typescript:S3776": "Cognitive complexity too high",
  "typescript:S125": "Sections of code should not be commented out",
  "typescript:S3863": "Unnecessary imports should be removed",
  "typescript:S2004": "Functions should not be nested too deeply",
  "typescript:S7764": "Duplicate string literals should be extracted",
  "typescript:S4138": "For-of should be used instead of for loop when index not needed",
  "typescript:S6551": "Boolean literal should not be used in expressions",
  "typescript:S4043": "Array methods should be used instead of loops",
  "typescript:S6582": "Prefer optional chaining over logical AND chains",
  "typescript:S3358": "Ternary operators should not be nested",
  "typescript:S7763": "Nullish coalescing should be preferred over OR",
  "typescript:S7778": "Type predicates should be used instead of type assertions",
  "typescript:S1874": "Deprecated APIs should not be used",
  "typescript:S6478": "React component should not be defined inside another component",
  "typescript:S6767": "useEffect dependencies should be exhaustive",
  "typescript:S6754": "React hooks should not be called conditionally",
  "typescript:S6819": "JSX props should not use arrow functions",
  "typescript:S4624": "Template literals should be used instead of string concatenation",
  "typescript:S6848": "React fragments should be used instead of unnecessary wrappers",
  "typescript:S6845": "Avoid spreading props onto DOM elements",
  "typescript:S6749": "JSX key should be provided in iterators",
  "typescript:S3696": "Exceptions should not be thrown from unexpected methods",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip the long project prefix from component path */
function shortPath(component) {
  return component.replace(/^[^:]+:/, "");
}

/** Keep only the fields an AI needs to understand and fix an issue */
function compact(issue) {
  return {
    file: shortPath(issue.component),
    line: issue.line,
    rule: issue.rule,
    sev: issue.severity,
    msg: issue.message,
    effort: issue.effort,
  };
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function write(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`  wrote ${filePath}  (${JSON.stringify(data).length} chars)`);
}

function slug(str) {
  return str
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Load ──────────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(INPUT, "utf8"));
const issues = raw.issues;

console.log(`Loaded ${issues.length} issues from ${INPUT}`);
console.log(`Mode: ${MODE}  →  output: ${MODE === "summary" ? "stdout / single file" : OUT_DIR}`);

// ── Modes ─────────────────────────────────────────────────────────────────────

// ── SUMMARY ───────────────────────────────────────────────────────────────────
if (MODE === "summary") {
  const bySeverity = {};
  const byRule = {};
  const byFile = {};

  for (const issue of issues) {
    const sev = issue.severity;
    const rule = issue.rule;
    const file = shortPath(issue.component);

    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;

    if (!byRule[rule])
      byRule[rule] = { label: RULE_LABELS[rule] ?? rule, count: 0, severity: sev, occurrences: [] };
    byRule[rule].count++;
    byRule[rule].occurrences.push({ file, line: issue.line, msg: issue.message });

    if (!byFile[file]) byFile[file] = { count: 0, issues: [] };
    byFile[file].count++;
    byFile[file].issues.push({ rule, line: issue.line, sev, msg: issue.message });
  }

  // Sort rules by count desc
  const sortedRules = Object.entries(byRule)
    .sort(([, a], [, b]) => b.count - a.count)
    .reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});

  // Sort files by issue count desc
  const sortedFiles = Object.entries(byFile)
    .sort(([, a], [, b]) => b.count - a.count)
    .reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});

  const summary = {
    _meta: {
      totalIssues: issues.length,
      bySeverity,
      topFiles: Object.entries(sortedFiles)
        .slice(0, 10)
        .map(([f, v]) => ({ file: f, count: v.count })),
    },
    byRule: sortedRules,
    byFile: sortedFiles,
  };

  ensureDir(OUT_DIR);
  write(join(OUT_DIR, "summary.json"), summary);
  console.log("\nDone. Feed summary.json to AI for a full picture.");
}

// ── BY-RULE ───────────────────────────────────────────────────────────────────
else if (MODE === "by-rule") {
  ensureDir(OUT_DIR);

  const grouped = {};
  for (const issue of issues) {
    const rule = issue.rule;
    if (!grouped[rule]) grouped[rule] = [];
    grouped[rule].push(compact(issue));
  }

  for (const [rule, items] of Object.entries(grouped)) {
    const payload = {
      rule,
      label: RULE_LABELS[rule] ?? rule,
      count: items.length,
      issues: items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    };
    write(join(OUT_DIR, `${slug(rule)}.json`), payload);
  }

  console.log(`\nDone. ${Object.keys(grouped).length} rule files written to ${OUT_DIR}`);
}

// ── BY-FILE ───────────────────────────────────────────────────────────────────
else if (MODE === "by-file") {
  ensureDir(OUT_DIR);

  const grouped = {};
  for (const issue of issues) {
    const file = shortPath(issue.component);
    if (!grouped[file]) grouped[file] = [];
    grouped[file].push(compact(issue));
  }

  for (const [file, items] of Object.entries(grouped)) {
    const name = slug(file.replace(/^src\//, ""));
    const payload = {
      file,
      count: items.length,
      issues: items.sort((a, b) => a.line - b.line),
    };
    write(join(OUT_DIR, `${name}.json`), payload);
  }

  console.log(`\nDone. ${Object.keys(grouped).length} file chunks written to ${OUT_DIR}`);
}

// ── BY-SEVERITY ───────────────────────────────────────────────────────────────
else if (MODE === "by-severity") {
  ensureDir(OUT_DIR);

  const grouped = {};
  for (const issue of issues) {
    const sev = issue.severity;
    if (!grouped[sev]) grouped[sev] = [];
    grouped[sev].push(compact(issue));
  }

  for (const [sev, items] of Object.entries(grouped)) {
    const payload = {
      severity: sev,
      count: items.length,
      issues: items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    };
    write(join(OUT_DIR, `${sev.toLowerCase()}.json`), payload);
  }

  console.log(`\nDone. ${Object.keys(grouped).length} severity files written to ${OUT_DIR}`);
} else {
  console.error(`Unknown mode: ${MODE}. Use summary | by-rule | by-file | by-severity`);
  process.exit(1);
}
