/**
 * Unit test runner - runs fixture tests without VS Code.
 *
 * This bypasses the VS Code Extension Host by using mock documents
 * and loading the parser service directly.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { groupTokens } from "../logic/Grouper";
import { ParserService } from "../parsing/ParserService";
import { createMockDocument } from "./mocks/MockDocument";

// Path to fixtures
const FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "test",
  "fixtures"
);

// Enable snapshot updates via environment variable
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "1";

// Padding character
const PAD = " ";

// Map file extensions to language IDs
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  py: "python",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  sql: "sql",
};

interface Fixture {
  dir: string;
  beforePath: string;
  afterPath: string;
  languageId: string;
}

function findFixtureFiles(dir: string): Fixture | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const match = file.match(/^before\.(\w+)\.txt$/);
    if (match) {
      const ext = match[1];
      const beforePath = path.join(dir, file);
      const afterFile = `after.${ext}.txt`;
      const afterPath = path.join(dir, afterFile);
      if (fs.existsSync(afterPath) || UPDATE_SNAPSHOTS) {
        return {
          dir,
          beforePath,
          afterPath,
          languageId: EXT_TO_LANG[ext] || ext,
        };
      }
    }
  }
  return null;
}

function collectFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = path.join(dir, entry.name);
        const fixture = findFixtureFiles(subdir);
        if (fixture) {
          fixtures.push(fixture);
        } else {
          walk(subdir);
        }
      }
    }
  }

  walk(FIXTURES_DIR);
  return fixtures;
}

function applyAlignment(
  sourceLines: string[],
  groups: ReturnType<typeof groupTokens>
): string[] {
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.tokens[0].line !== b.tokens[0].line) {
      return a.tokens[0].line - b.tokens[0].line;
    }
    return a.tokens[0].column - b.tokens[0].column;
  });

  const lineShift = new Map<number, number>();
  const paddingOps: Array<{ line: number; column: number; spaces: number }> =
    [];

  for (const group of sortedGroups) {
    let visualTargetColumn: number;

    if (group.tokens.length === 1) {
      const token = group.tokens[0];
      const shift = lineShift.get(token.line) ?? 0;
      if (group.padAfter) {
        const originalEndColumn = token.column + token.text.length;
        const originalPadding = group.targetColumn - originalEndColumn;
        visualTargetColumn = originalEndColumn + shift + originalPadding;
      } else {
        const originalPadding = group.targetColumn - token.column;
        visualTargetColumn = token.column + shift + originalPadding;
      }
    } else if (group.padAfter) {
      visualTargetColumn = Math.max(
        ...group.tokens.map((t) => {
          const shift = lineShift.get(t.line) ?? 0;
          return t.column + t.text.length + shift;
        })
      );
    } else {
      visualTargetColumn = Math.max(
        ...group.tokens.map((t) => {
          const shift = lineShift.get(t.line) ?? 0;
          return t.column + shift;
        })
      );
    }

    for (const token of group.tokens) {
      const shift = lineShift.get(token.line) ?? 0;
      let spacesNeeded: number;
      let insertColumn: number;

      if (group.padAfter) {
        const visualEndColumn = token.column + token.text.length + shift;
        spacesNeeded = visualTargetColumn - visualEndColumn;
        insertColumn = token.column + token.text.length;
      } else {
        const visualColumn = token.column + shift;
        spacesNeeded = visualTargetColumn - visualColumn;
        insertColumn = token.column;
      }

      if (spacesNeeded > 0) {
        paddingOps.push({
          line: token.line,
          column: insertColumn,
          spaces: spacesNeeded,
        });
        lineShift.set(
          token.line,
          (lineShift.get(token.line) ?? 0) + spacesNeeded
        );
      }
    }
  }

  const result: string[] = [];
  for (let lineIdx = 0; lineIdx < sourceLines.length; lineIdx++) {
    let line = sourceLines[lineIdx];
    const linePaddings = paddingOps
      .filter((op) => op.line === lineIdx)
      .sort((a, b) => b.column - a.column);
    for (const { column, spaces } of linePaddings) {
      const before = line.slice(0, column);
      const after = line.slice(column);
      line = before + PAD.repeat(spaces) + after;
    }
    result.push(line);
  }

  return result;
}

async function runTests(): Promise<void> {
  console.log("Unit Test Runner (no VS Code)");
  console.log("=============================\n");

  // Find wasmDir
  let wasmDir: string;
  try {
    const treeSitterPath = require.resolve("@vscode/tree-sitter-wasm");
    wasmDir = path.dirname(treeSitterPath);
  } catch {
    wasmDir = path.join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "@vscode",
      "tree-sitter-wasm",
      "wasm"
    );
  }

  // Initialize parser
  const parserService = new ParserService({ wasmDir });
  await parserService.initialize();

  // Collect fixtures
  const fixtures = collectFixtures();
  console.log(`Found ${fixtures.length} fixtures\n`);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const fixture of fixtures) {
    const fixtureName = path.relative(FIXTURES_DIR, fixture.dir);

    try {
      const beforeContent = fs
        .readFileSync(fixture.beforePath, "utf-8")
        .replace(/\r\n/g, "\n");
      const doc = createMockDocument(beforeContent, fixture.languageId);
      const tokens = await parserService.parse(doc, 0, doc.lineCount - 1);
      const groups = groupTokens(tokens);
      const sourceLines = beforeContent.split("\n");
      const actualLines = applyAlignment(sourceLines, groups);
      const actual = actualLines.join("\n");

      if (UPDATE_SNAPSHOTS) {
        fs.writeFileSync(fixture.afterPath, actual);
        console.log(`  ✓ ${fixtureName} (updated)`);
        passed++;
        continue;
      }

      if (!fs.existsSync(fixture.afterPath)) {
        console.log(`  ✗ ${fixtureName} (no snapshot)`);
        failed++;
        failures.push(`${fixtureName}: Snapshot missing`);
        continue;
      }

      const afterContent = fs
        .readFileSync(fixture.afterPath, "utf-8")
        .replace(/\r\n/g, "\n");
      assert.strictEqual(actual, afterContent);
      console.log(`  ✓ ${fixtureName}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${fixtureName}`);
      failed++;
      failures.push(
        `${fixtureName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  }

  parserService.dispose();
}

runTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
