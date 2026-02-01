/**
 * Fixture-based declarative tests for alignment.
 *
 * Each fixture folder contains:
 * - input.txt: Source code (for documentation)
 * - tokens.txt: Token definitions to test
 * - expected.txt: Expected alignment output (visual format with · for spaces)
 * - config.txt: Optional configuration
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { AlignmentToken, OperatorType } from "../core/types";
import { groupTokens } from "../logic/Grouper";

// __dirname is out/test at runtime, but fixtures are in src/test
// Go up two levels (out/test -> out -> root) then into src/test/fixtures
const FIXTURES_DIR = path.join(__dirname, "..", "..", "src", "test", "fixtures");

/**
 * Parse tokens from a tokens.txt file.
 * Format: line, column, "text", type, indent, parentType, tokenIndex, scopeId
 */
function parseTokensFile(content: string): AlignmentToken[] {
  const tokens: AlignmentToken[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse CSV-like format: 0, 8, "=", =, 0, variable_declaration, 0, scope_1
    const match = trimmed.match(
      /^(\d+),\s*(\d+),\s*"([^"]+)",\s*(\S+),\s*(\d+),\s*(\S+),\s*(\d+),\s*(\S+)$/
    );
    if (!match) {
      console.warn(`Skipping invalid line: ${trimmed}`);
      continue;
    }

    const [, lineNum, column, text, type, indent, parentType, tokenIndex, scopeId] = match;

    tokens.push({
      line: parseInt(lineNum, 10),
      column: parseInt(column, 10),
      text,
      type: type as OperatorType,
      indent: parseInt(indent, 10),
      parentType,
      tokenIndex: parseInt(tokenIndex, 10),
      scopeId,
      operatorCountOnLine: 1,
    });
  }

  return tokens;
}

/**
 * Apply alignment groups to source lines to produce visual output.
 * Uses · to represent virtual padding spaces.
 */
function applyAlignment(sourceLines: string[], groups: ReturnType<typeof groupTokens>): string[] {
  // Track padding to add at each (line, column) position
  const paddingMap = new Map<string, number>();

  for (const group of groups) {
    for (const token of group.tokens) {
      let spacesNeeded: number;
      let insertColumn: number;

      if (group.padAfter) {
        // Pad after the token
        const endColumn = token.column + token.text.length;
        spacesNeeded = group.targetColumn - endColumn;
        insertColumn = endColumn;
      } else {
        // Pad before the token
        spacesNeeded = group.targetColumn - token.column;
        insertColumn = token.column;
      }

      if (spacesNeeded > 0) {
        const key = `${token.line}:${insertColumn}`;
        const existing = paddingMap.get(key) ?? 0;
        paddingMap.set(key, Math.max(existing, spacesNeeded));
      }
    }
  }

  // Apply padding to each line
  const result: string[] = [];
  for (let lineIdx = 0; lineIdx < sourceLines.length; lineIdx++) {
    let line = sourceLines[lineIdx];
    
    // Collect all padding for this line, sorted by column (descending to avoid offset issues)
    const linePaddings: Array<{ column: number; spaces: number }> = [];
    for (const [key, spaces] of paddingMap) {
      const [l, c] = key.split(":").map(Number);
      if (l === lineIdx) {
        linePaddings.push({ column: c, spaces });
      }
    }
    linePaddings.sort((a, b) => b.column - a.column);

    // Insert padding (from right to left to preserve column positions)
    for (const { column, spaces } of linePaddings) {
      const before = line.slice(0, column);
      const after = line.slice(column);
      line = before + "·".repeat(spaces) + after;
    }

    result.push(line);
  }

  return result;
}

/**
 * Collect all fixture directories.
 */
function collectFixtures(): string[] {
  const fixtures: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = path.join(dir, entry.name);
        // Check if this is a fixture (has tokens.txt)
        if (fs.existsSync(path.join(subdir, "tokens.txt"))) {
          fixtures.push(subdir);
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
  const fixtures = collectFixtures();

  for (const fixtureDir of fixtures) {
    const fixtureName = path.relative(FIXTURES_DIR, fixtureDir);

    test(fixtureName, () => {
      // Read fixture files
      const tokensPath = path.join(fixtureDir, "tokens.txt");
      const inputPath = path.join(fixtureDir, "input.txt");
      const expectedPath = path.join(fixtureDir, "expected.txt");

      const tokensContent = fs.readFileSync(tokensPath, "utf-8");
      const inputContent = fs.readFileSync(inputPath, "utf-8");
      const expectedContent = fs.readFileSync(expectedPath, "utf-8");

      // Parse tokens
      const tokens = parseTokensFile(tokensContent);

      // Group tokens
      const groups = groupTokens(tokens);

      // Apply alignment to source
      const sourceLines = inputContent.split("\n");
      const actualLines = applyAlignment(sourceLines, groups);
      const actual = actualLines.join("\n");

      // Compare to expected
      const expected = expectedContent;

      assert.strictEqual(
        actual,
        expected,
        `Fixture ${fixtureName} failed.\n\nActual:\n${actual}\n\nExpected:\n${expected}`
      );
    });
  }
});
