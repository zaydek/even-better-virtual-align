/**
 * Grouper Tests
 *
 * Tests for the token grouping algorithm that determines which tokens
 * should be aligned together.
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

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
    // For `=` operators, padAfter=false, so targetColumn = max(column) = 10
    assert.strictEqual(groups[0].targetColumn, 10);
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
    // With the bucket-based grouper, tokens are grouped by (type, indent, parentType, tokenIndex)
    const tokens: AlignmentToken[] = [
      // Line 0
      token(0, 8, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(0, 15, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 1 }),
      // Line 1 (consecutive)
      token(1, 8, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(1, 15, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 1 }),
    ];

    const groups = groupTokens(tokens);

    // Should form 2 groups: one for tokenIndex 0, one for tokenIndex 1
    assert.strictEqual(groups.length, 2);

    // Group 0: both colons with tokenIndex 0
    assert.strictEqual(groups[0].tokens.length, 2);
    assert.strictEqual(groups[0].tokens[0].tokenIndex, 0);
    assert.strictEqual(groups[0].tokens[1].tokenIndex, 0);

    // Group 1: both colons with tokenIndex 1
    assert.strictEqual(groups[1].tokens.length, 2);
    assert.strictEqual(groups[1].tokens[0].tokenIndex, 1);
    assert.strictEqual(groups[1].tokens[1].tokenIndex, 1);
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
    const tokens: AlignmentToken[] = [token(0, 5, "=", "=")];

    const groups = groupTokens(tokens);
    assert.strictEqual(groups.length, 0);
  });

  test("calculates target column for colon operators", () => {
    const tokens: AlignmentToken[] = [
      token(0, 5, ":", ":", { indent: 2, parentType: "pair" }),
      token(1, 10, ":", ":", { indent: 2, parentType: "pair" }),
    ];

    const groups = groupTokens(tokens);

    // For `:` operators, padAfter=true, so targetColumn = max(column + text.length) = max(6, 11) = 11
    assert.strictEqual(groups[0].targetColumn, 11);
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
    // Note: This test simulates SINGLE objects per line (one-property-per-line)
    // For the grouper to work, tokens must be on consecutive lines
    // Let's test with objects on separate lines, each with one property
    const tokens: AlignmentToken[] = [
      token(1, 8, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // { line: 0 }
      token(2, 8, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // { line: 1 }
    ];

    const groups = groupTokens(tokens);

    // One group: both colons at same tokenIndex on consecutive lines
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 2);
  });

  test("YAML nested structure: each indent level aligns independently", () => {
    // Simulating:
    // spec:
    //   replicas: 3
    //   strategy: RollingUpdate
    //   selector:
    //     app:  backend
    //     tier: production
    const tokens: AlignmentToken[] = [
      // Level 1 (indent 0): spec:
      token(0, 4, ":", ":", { indent: 0, parentType: "pair", tokenIndex: 0 }),
      // Level 2 (indent 2): replicas, strategy, selector
      token(1, 10, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }), // replicas:
      token(2, 10, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }), // strategy:
      token(3, 10, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }), // selector:
      // Level 3 (indent 4): app, tier
      token(4, 7, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // app:
      token(5, 8, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }), // tier:
    ];

    const groups = groupTokens(tokens);

    // Should form 2 groups:
    // - Group 1: replicas, strategy, selector (indent 2, consecutive lines 1-3)
    // - Group 2: app, tier (indent 4, consecutive lines 4-5)
    // Note: spec: at line 0 is alone (different indent from line 1)
    assert.strictEqual(groups.length, 2);

    // First group: replicas, strategy, selector
    assert.strictEqual(groups[0].tokens.length, 3);
    assert.strictEqual(groups[0].tokens[0].indent, 2);
    assert.strictEqual(groups[0].tokens[1].indent, 2);
    assert.strictEqual(groups[0].tokens[2].indent, 2);

    // Second group: app, tier
    assert.strictEqual(groups[1].tokens.length, 2);
    assert.strictEqual(groups[1].tokens[0].indent, 4);
    assert.strictEqual(groups[1].tokens[1].indent, 4);
  });

  test("padAfter is true for colon operators, false for equals", () => {
    const colonTokens: AlignmentToken[] = [
      token(0, 5, ":", ":", { indent: 0, parentType: "pair" }),
      token(1, 10, ":", ":", { indent: 0, parentType: "pair" }),
    ];
    const equalsTokens: AlignmentToken[] = [
      token(0, 5, "=", "=", { indent: 0, parentType: "assignment" }),
      token(1, 10, "=", "=", { indent: 0, parentType: "assignment" }),
    ];

    const colonGroups = groupTokens(colonTokens);
    const equalsGroups = groupTokens(equalsTokens);

    // Colons pad after
    assert.strictEqual(colonGroups[0].padAfter, true);
    // Equals pad before
    assert.strictEqual(equalsGroups[0].padAfter, false);
  });
});

suite("Types Tests", () => {
  test("isSupportedLanguage returns true for supported languages", () => {
    const { isSupportedLanguage } = require("../../core/types");
    assert.strictEqual(isSupportedLanguage("typescript"), true);
    assert.strictEqual(isSupportedLanguage("typescriptreact"), true);
    assert.strictEqual(isSupportedLanguage("json"), true);
    assert.strictEqual(isSupportedLanguage("jsonc"), true);
    assert.strictEqual(isSupportedLanguage("yaml"), true);
    assert.strictEqual(isSupportedLanguage("python"), true);
    assert.strictEqual(isSupportedLanguage("css"), true);
    assert.strictEqual(isSupportedLanguage("scss"), true);
    assert.strictEqual(isSupportedLanguage("less"), true);
    assert.strictEqual(isSupportedLanguage("markdown"), true);
  });

  test("isSupportedLanguage returns false for unsupported languages", () => {
    const { isSupportedLanguage } = require("../../core/types");
    assert.strictEqual(isSupportedLanguage("javascript"), false);
    assert.strictEqual(isSupportedLanguage("rust"), false);
    assert.strictEqual(isSupportedLanguage("go"), false);
  });
});
