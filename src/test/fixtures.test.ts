/**
 * Fixture-based declarative tests - Uses real parser.
 *
 * Each fixture folder contains a pair of files:
 * - before.{lang}.txt: Source code before alignment (e.g., before.ts.txt)
 * - after.{lang}.txt: Expected alignment output with · for padding
 *
 * The language is extracted from the filename (before.ts.txt → typescript).
 * Both files use .txt to keep Prettier/ESLint from modifying them.
 *
 * Run with UPDATE_SNAPSHOTS=1 to auto-generate after files:
 *   UPDATE_SNAPSHOTS=1 npm test
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { groupTokens } from "../logic/Grouper";
import { ParserService } from "../parsing/ParserService";

// Path to fixtures (src/test/fixtures from project root)
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

// Padding character for visual alignment markers
const PAD = "·";

// Shared parser instance (initialized once)
let parserService: ParserService | null = null;

// Map file extensions to VSCode language IDs
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
};

/**
 * Find before/after file pair in a fixture directory.
 * Before: before.{lang}.txt (e.g., before.ts.txt) - source code
 * After: after.{lang}.txt (e.g., after.ts.txt) - expected alignment with · padding
 *
 * Returns { beforePath, afterPath, languageId } or null if not found.
 */
function findFixtureFiles(
  dir: string
): { beforePath: string; afterPath: string; languageId: string } | null {
  const files = fs.readdirSync(dir);

  // Look for before.{lang}.txt pattern
  for (const file of files) {
    const match = file.match(/^before\.(\w+)\.txt$/);
    if (match) {
      const ext = match[1];
      const beforePath = path.join(dir, file);
      const afterFile = `after.${ext}.txt`;
      const afterPath = path.join(dir, afterFile);

      // In UPDATE_SNAPSHOTS mode, after file doesn't need to exist yet
      if (fs.existsSync(afterPath) || UPDATE_SNAPSHOTS) {
        const languageId = EXT_TO_LANG[ext] || ext;
        return {
          beforePath,
          afterPath,
          languageId,
        };
      }
    }
  }

  return null;
}

/**
 * Apply alignment groups to source lines to produce visual output.
 * Uses · to represent virtual padding spaces.
 *
 * This accounts for cumulative shift: earlier padding on a line shifts
 * later operators, so we recalculate target columns using visual positions.
 */
function applyAlignment(
  sourceLines: string[],
  groups: ReturnType<typeof groupTokens>
): string[] {
  // Sort groups by their first token's position (line, then column)
  // This ensures we process earlier tokens first
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.tokens[0].line !== b.tokens[0].line) {
      return a.tokens[0].line - b.tokens[0].line;
    }
    return a.tokens[0].column - b.tokens[0].column;
  });

  // Track cumulative shift per line (padding added so far)
  const lineShift = new Map<number, number>();

  // Collect all padding operations
  const paddingOps: Array<{ line: number; column: number; spaces: number }> = [];

  for (const group of sortedGroups) {
    // Recalculate targetColumn based on VISUAL positions (accounting for shift)
    let visualTargetColumn: number;

    // Special case: single-token groups (like inline_object_colon_min)
    // Use the group's targetColumn directly, adjusted for shift
    if (group.tokens.length === 1) {
      const token = group.tokens[0];
      const shift = lineShift.get(token.line) ?? 0;
      // The group's targetColumn already includes the desired padding
      // Just adjust for any previous shifts on this line
      if (group.padAfter) {
        const originalEndColumn = token.column + token.text.length;
        const originalPadding = group.targetColumn - originalEndColumn;
        visualTargetColumn = originalEndColumn + shift + originalPadding;
      } else {
        const originalPadding = group.targetColumn - token.column;
        visualTargetColumn = token.column + shift + originalPadding;
      }
    } else if (group.padAfter) {
      // For padAfter, target is max visual end position
      visualTargetColumn = Math.max(
        ...group.tokens.map((t) => {
          const shift = lineShift.get(t.line) ?? 0;
          return t.column + t.text.length + shift;
        })
      );
    } else {
      // For padBefore, target is max visual start position
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
        // Pad after the token
        const visualEndColumn = token.column + token.text.length + shift;
        spacesNeeded = visualTargetColumn - visualEndColumn;
        insertColumn = token.column + token.text.length;
      } else {
        // Pad before the token
        const visualColumn = token.column + shift;
        spacesNeeded = visualTargetColumn - visualColumn;
        insertColumn = token.column;
      }

      if (spacesNeeded > 0) {
        paddingOps.push({ line: token.line, column: insertColumn, spaces: spacesNeeded });
        // Update shift for this line
        lineShift.set(token.line, (lineShift.get(token.line) ?? 0) + spacesNeeded);
      }
    }
  }

  // Apply padding to each line (right to left to preserve column positions)
  const result: string[] = [];
  for (let lineIdx = 0; lineIdx < sourceLines.length; lineIdx++) {
    let line = sourceLines[lineIdx];

    // Collect padding for this line, sorted by column descending
    const linePaddings = paddingOps
      .filter((op) => op.line === lineIdx)
      .sort((a, b) => b.column - a.column);

    // Insert padding (from right to left)
    for (const { column, spaces } of linePaddings) {
      const before = line.slice(0, column);
      const after = line.slice(column);
      line = before + PAD.repeat(spaces) + after;
    }

    result.push(line);
  }

  return result;
}

/**
 * Collect all fixture directories.
 */
function collectFixtures(): Array<{
  dir: string;
  beforePath: string;
  afterPath: string;
  languageId: string;
}> {
  const fixtures: Array<{
    dir: string;
    beforePath: string;
    afterPath: string;
    languageId: string;
  }> = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = path.join(dir, entry.name);
        const fixtureFiles = findFixtureFiles(subdir);

        if (fixtureFiles) {
          fixtures.push({ dir: subdir, ...fixtureFiles });
        } else {
          walk(subdir);
        }
      }
    }
  }

  walk(FIXTURES_DIR);
  return fixtures;
}

suite("Fixture Tests", () => {
  // Initialize parser before all tests
  suiteSetup(async () => {
    // Create a mock extension context
    const mockContext = {
      extensionPath: path.join(__dirname, "..", ".."),
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
      },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        setKeysForSync: () => {},
      },
      extensionUri: vscode.Uri.file(path.join(__dirname, "..", "..")),
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file("/tmp"),
      logUri: vscode.Uri.file("/tmp"),
      extensionMode: vscode.ExtensionMode.Test,
      storagePath: undefined,
      globalStoragePath: "/tmp",
      logPath: "/tmp",
      asAbsolutePath: (p: string) => path.join(__dirname, "..", "..", p),
      environmentVariableCollection:
        {} as vscode.GlobalEnvironmentVariableCollection,
      secrets: {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
          .event,
      },
      extension: {} as vscode.Extension<unknown>,
    } as unknown as vscode.ExtensionContext;

    parserService = new ParserService(mockContext);
    await parserService.initialize();
  });

  // Dispose parser after all tests
  suiteTeardown(() => {
    if (parserService) {
      parserService.dispose();
      parserService = null;
    }
  });

  const fixtures = collectFixtures();

  for (const fixture of fixtures) {
    const fixtureName = path.relative(FIXTURES_DIR, fixture.dir);

    test(fixtureName, async () => {
      // Read before file and normalize line endings
      const beforeContent = fs
        .readFileSync(fixture.beforePath, "utf-8")
        .replace(/\r\n/g, "\n");

      // Create a virtual document
      const doc = await vscode.workspace.openTextDocument({
        content: beforeContent,
        language: fixture.languageId,
      });

      // Parse document
      const tokens = await parserService!.parse(doc, 0, doc.lineCount - 1);

      // Group tokens
      const groups = groupTokens(tokens);

      // Apply alignment to source
      const sourceLines = beforeContent.split("\n");
      const actualLines = applyAlignment(sourceLines, groups);
      const actual = actualLines.join("\n");

      // UPDATE_SNAPSHOTS mode: write actual to after file
      if (UPDATE_SNAPSHOTS) {
        fs.writeFileSync(fixture.afterPath, actual);
        console.log(`Updated snapshot: ${fixture.afterPath}`);
        return;
      }

      // Normal mode: compare to after file
      if (!fs.existsSync(fixture.afterPath)) {
        assert.fail(
          `Snapshot missing for ${fixtureName}. Run with UPDATE_SNAPSHOTS=1 to create.`
        );
      }

      const afterContent = fs
        .readFileSync(fixture.afterPath, "utf-8")
        .replace(/\r\n/g, "\n");

      assert.strictEqual(
        actual,
        afterContent,
        `Fixture ${fixtureName} failed.\n\nActual:\n${actual}\n\nExpected:\n${afterContent}`
      );
    });
  }
});
