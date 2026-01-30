/**
 * Tests for Alignment Sanity extension.
 */

import * as assert from "assert";
import { AlignmentToken } from "../core/types";
import { groupTokens } from "../logic/Grouper";

// Helper to create tokens with default values
function token(
  line: number,
  column: number,
  text: string,
  type: "=" | ":" | "&&" | "||" | "and" | "or",
  opts?: {
    indent?: number;
    parentType?: string;
    tokenIndex?: number;
  },
): AlignmentToken {
  return {
    line,
    column,
    text,
    type,
    indent: opts?.indent ?? 0,
    parentType: opts?.parentType ?? "pair",
    tokenIndex: opts?.tokenIndex ?? 0,
  };
}

suite("Grouper Tests", () => {
  test("groups consecutive tokens with same type, indent, parentType, and tokenIndex", () => {
    const tokens: AlignmentToken[] = [
      token(0, 10, "=", "=", { indent: 2, parentType: "variable_declaration" }),
      token(1, 5, "=", "=", { indent: 2, parentType: "variable_declaration" }),
      token(2, 8, "=", "=", { indent: 2, parentType: "variable_declaration" }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
    // targetColumn = max(10+1, 5+1, 8+1) + 1 = 11 + 1 = 12
    assert.strictEqual(groups[0].targetColumn, 12);
  });

  test("separates tokens with different types", () => {
    const tokens: AlignmentToken[] = [
      token(0, 5, "=", "=", { indent: 0 }),
      token(1, 5, ":", ":", { indent: 0 }),
    ];

    const groups = groupTokens(tokens);

    // Each token is alone, so no groups (groups require 2+ tokens)
    assert.strictEqual(groups.length, 0);
  });

  test("separates tokens with different indentation (nesting levels)", () => {
    // This tests the JSON nesting problem
    const tokens: AlignmentToken[] = [
      // Outer object property
      token(0, 15, ":", ":", { indent: 2, parentType: "pair" }),
      // Inner object property (different indent)
      token(1, 25, ":", ":", { indent: 4, parentType: "pair" }),
    ];

    const groups = groupTokens(tokens);

    // Different indents = no grouping
    assert.strictEqual(groups.length, 0);
  });

  test("separates tokens with different parent types", () => {
    // This tests the TypeScript structure problem
    const tokens: AlignmentToken[] = [
      // Type annotation colon
      token(0, 12, ":", ":", { indent: 0, parentType: "type_annotation" }),
      // Object property colon
      token(1, 8, ":", ":", { indent: 2, parentType: "pair" }),
    ];

    const groups = groupTokens(tokens);

    // Different parent types = no grouping
    assert.strictEqual(groups.length, 0);
  });

  test("separates tokens with different token indices", () => {
    // This tests { line: 0, column: 5 } case
    // The "line:" (index 0) should not align with "column:" (index 1)
    const tokens: AlignmentToken[] = [
      token(0, 8, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(0, 15, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 1 }),
      token(1, 8, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(1, 15, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 1 }),
    ];

    const groups = groupTokens(tokens);

    // Should form 2 groups: one for tokenIndex 0, one for tokenIndex 1
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].tokens.length, 2);
    assert.strictEqual(groups[1].tokens.length, 2);
  });

  test("breaks group on non-consecutive lines", () => {
    const tokens: AlignmentToken[] = [
      token(0, 5, "=", "=", { indent: 0, parentType: "declaration" }),
      token(1, 5, "=", "=", { indent: 0, parentType: "declaration" }),
      // Gap of 2 lines (blank line between)
      token(4, 5, "=", "=", { indent: 0, parentType: "declaration" }),
      token(5, 5, "=", "=", { indent: 0, parentType: "declaration" }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 2);
  });

  test("handles empty input", () => {
    const groups = groupTokens([]);
    assert.strictEqual(groups.length, 0);
  });

  test("handles single token (no group formed)", () => {
    const tokens: AlignmentToken[] = [
      token(0, 5, "=", "="),
    ];

    const groups = groupTokens(tokens);
    assert.strictEqual(groups.length, 0);
  });

  test("calculates target column with at least 1 space after operator", () => {
    const tokens: AlignmentToken[] = [
      token(0, 5, ":", ":", { indent: 2, parentType: "pair" }),
      token(1, 10, ":", ":", { indent: 2, parentType: "pair" }),
    ];

    const groups = groupTokens(tokens);

    // Max operator end is 10 + 1 = 11, plus 1 space = 12
    assert.strictEqual(groups[0].targetColumn, 12);
  });

  test("real-world JSON example: nested objects don't align", () => {
    // Simulating:
    // {
    //   "dependencies": {
    //     "@pkg": "1.0"
    //   }
    // }
    const tokens: AlignmentToken[] = [
      token(1, 16, ":", ":", { indent: 2, parentType: "pair" }), // "dependencies":
      token(2, 11, ":", ":", { indent: 4, parentType: "pair" }), // "@pkg":
    ];

    const groups = groupTokens(tokens);

    // Different indents = no grouping, even though both are "pair" type
    assert.strictEqual(groups.length, 0);
  });

  test("real-world TypeScript: array of objects aligns per-column", () => {
    // Simulating:
    // [
    //   { line: 0, column: 5 },
    //   { line: 1, column: 10 }
    // ]
    const tokens: AlignmentToken[] = [
      token(1, 8, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // line:
      token(1, 18, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 1 }), // column:
      token(2, 8, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // line:
      token(2, 18, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 1 }), // column:
    ];

    const groups = groupTokens(tokens);

    // Two groups: one for first colons, one for second colons
    assert.strictEqual(groups.length, 2);
    
    // First group: both "line:" colons
    assert.strictEqual(groups[0].tokens[0].tokenIndex, 0);
    assert.strictEqual(groups[0].tokens[1].tokenIndex, 0);
    
    // Second group: both "column:" colons
    assert.strictEqual(groups[1].tokens[0].tokenIndex, 1);
    assert.strictEqual(groups[1].tokens[1].tokenIndex, 1);
  });
});

suite("Types Tests", () => {
  test("isSupportedLanguage returns true for supported languages", () => {
    const { isSupportedLanguage } = require("../core/types");
    assert.strictEqual(isSupportedLanguage("typescript"), true);
    assert.strictEqual(isSupportedLanguage("typescriptreact"), true);
    assert.strictEqual(isSupportedLanguage("json"), true);
    assert.strictEqual(isSupportedLanguage("jsonc"), true);
    assert.strictEqual(isSupportedLanguage("python"), true);
  });

  test("isSupportedLanguage returns false for unsupported languages", () => {
    const { isSupportedLanguage } = require("../core/types");
    assert.strictEqual(isSupportedLanguage("javascript"), false);
    assert.strictEqual(isSupportedLanguage("rust"), false);
    assert.strictEqual(isSupportedLanguage("go"), false);
  });
});
