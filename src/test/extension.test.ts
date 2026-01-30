/**
 * Tests for Even Better Virtual Align extension.
 */

import * as assert from "assert";
import { AlignmentToken } from "../core/types";
import { groupTokens } from "../logic/Grouper";

// Helper to create tokens with default values
function token(
  line: number,
  column: number,
  text: string,
  type: "=" | ":" | "," | "&&" | "||" | "and" | "or" | "//" | "funcArg",
  opts?: {
    indent?: number;
    parentType?: string;
    tokenIndex?: number;
    scopeId?: string;
    operatorCountOnLine?: number;
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
    scopeId: opts?.scopeId ?? "default_scope",
    operatorCountOnLine: opts?.operatorCountOnLine ?? 1,
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
    const { isSupportedLanguage } = require("../core/types");
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
    const { isSupportedLanguage } = require("../core/types");
    assert.strictEqual(isSupportedLanguage("javascript"), false);
    assert.strictEqual(isSupportedLanguage("rust"), false);
    assert.strictEqual(isSupportedLanguage("go"), false);
  });
});

/**
 * JSON Colon Finder Tests
 *
 * These test cases verify that the state machine correctly identifies
 * structural colons (key-value separators) and ignores colons inside strings.
 */
suite("JSON Colon Finder Edge Cases", () => {
  // Helper that mimics the findJsonColons state machine
  function findJsonColons(line: string): number[] {
    const colonPositions: number[] = [];
    let inString = false;
    let escaped = false;
    let lastStringEnd = -1;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        if (!inString) {
          inString = true;
        } else {
          inString = false;
          lastStringEnd = i;
        }
        continue;
      }

      if (char === ":" && !inString && lastStringEnd !== -1) {
        const between = line.substring(lastStringEnd + 1, i);
        if (/^\s*$/.test(between)) {
          colonPositions.push(i);
        }
        lastStringEnd = -1;
      }
    }

    return colonPositions;
  }

  test("simple key-value", () => {
    const line = '  "name": "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
    assert.strictEqual(colons[0], 8); // Position of the structural colon
  });

  test("key with colon in name (THE BUG)", () => {
    // This was the original bug: "vscode:prepublish" has a colon inside
    const line = '  "vscode:prepublish": "npm run compile"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
    // The colon is at position 21 (0-indexed): spaces(2) + quote + "vscode:prepublish" (18) + quote = 21
    assert.strictEqual(colons[0], 21);
  });

  test("multiple colons in key", () => {
    const line = '  "a:b:c:d": "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
    // Should find only the structural colon, not the ones inside the key
  });

  test("URL in value (colon after http)", () => {
    const line = '  "url": "http://example.com:8080"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
    assert.strictEqual(colons[0], 7); // Only the key-value colon
  });

  test("escaped quote in key", () => {
    const line = '  "key\\"name": "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("escaped backslash before quote", () => {
    // "path\\" means the string ends after \\, the quote after is the real closing quote
    const line = '  "path\\\\": "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("escaped quote followed by colon in key", () => {
    const line = '  "key\\":name": "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("number value", () => {
    const line = '  "count": 42';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("boolean value", () => {
    const line = '  "enabled": true';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("null value", () => {
    const line = '  "data": null';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("empty key", () => {
    const line = '  "": "empty key"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("empty value", () => {
    const line = '  "key": ""';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("no space after colon", () => {
    const line = '  "key":"value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("multiple spaces after colon", () => {
    const line = '  "key":    "value"';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1);
  });

  test("inline nested object (multiple colons)", () => {
    const line = '  "config": { "inner:key": "value" }';
    const colons = findJsonColons(line);
    // Should find 2 structural colons: after "config" and after "inner:key"
    assert.strictEqual(colons.length, 2);
  });

  test("array with colons in strings", () => {
    const line = '  "items": ["a:b", "c:d"]';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 1); // Only the key-value colon
  });

  test("multiple key-value pairs on one line", () => {
    const line = '{ "a": 1, "b:c": 2, "d": 3 }';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 3); // Three structural colons
  });

  test("complex nested with colons everywhere", () => {
    const line = '  "key:with:colons": { "nested:key": "value:with:colons" }';
    const colons = findJsonColons(line);
    assert.strictEqual(colons.length, 2); // Only the two structural colons
  });
});

/**
 * Gofmt-style Alignment Integration Tests
 *
 * These test real-world scenarios to ensure the complete pipeline works correctly.
 */
suite("Gofmt-style Alignment Scenarios", () => {
  test("interface properties align (Go struct-like)", () => {
    // interface User {
    //   id:          number;
    //   name:        string;
    //   description: string;
    // }
    const tokens: AlignmentToken[] = [
      token(1, 4, ":", ":", {
        indent: 2,
        parentType: "property_signature",
        tokenIndex: 0,
      }),
      token(2, 6, ":", ":", {
        indent: 2,
        parentType: "property_signature",
        tokenIndex: 0,
      }),
      token(3, 13, ":", ":", {
        indent: 2,
        parentType: "property_signature",
        tokenIndex: 0,
      }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
    // For `:` operators, padAfter=true, targetColumn = max(column + text.length)
    // = max(4+1, 6+1, 13+1) = max(5, 7, 14) = 14
    assert.strictEqual(groups[0].targetColumn, 14);
  });

  test("const declarations align (Go var-like)", () => {
    // const x     = 1;
    // const foo   = 2;
    // const bar   = 3;
    const tokens: AlignmentToken[] = [
      token(0, 8, "=", "=", {
        indent: 0,
        parentType: "variable_declaration",
        tokenIndex: 0,
      }),
      token(1, 10, "=", "=", {
        indent: 0,
        parentType: "variable_declaration",
        tokenIndex: 0,
      }),
      token(2, 10, "=", "=", {
        indent: 0,
        parentType: "variable_declaration",
        tokenIndex: 0,
      }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
  });

  test("blank line breaks alignment group", () => {
    // const a = 1;
    // const b = 2;
    //
    // const c = 3;
    // const d = 4;
    const tokens: AlignmentToken[] = [
      token(0, 8, "=", "=", { indent: 0, parentType: "variable_declaration" }),
      token(1, 8, "=", "=", { indent: 0, parentType: "variable_declaration" }),
      // Line 2 is blank
      token(3, 8, "=", "=", { indent: 0, parentType: "variable_declaration" }),
      token(4, 8, "=", "=", { indent: 0, parentType: "variable_declaration" }),
    ];

    const groups = groupTokens(tokens);

    // Should be 2 separate groups due to the blank line gap
    assert.strictEqual(groups.length, 2);
  });

  test("type annotation does NOT align with object property", () => {
    // const tokens: AlignmentToken[] = [  <- type annotation
    //   { line: 0, column: 5 },            <- object property
    // ];
    const tokens: AlignmentToken[] = [
      token(0, 13, ":", ":", {
        indent: 0,
        parentType: "type_annotation",
        tokenIndex: 0,
      }),
      token(1, 8, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
    ];

    const groups = groupTokens(tokens);

    // No alignment: different parent types AND different indentation
    assert.strictEqual(groups.length, 0);
  });

  test("ternary colons should NOT align with object properties", () => {
    // const x = cond ? "a" : "b";
    // const obj = { key: value };
    // These should NOT align because ternary : is a different parent type
    const tokens: AlignmentToken[] = [
      token(0, 22, ":", ":", {
        indent: 0,
        parentType: "ternary_expression",
        tokenIndex: 0,
      }),
      token(1, 18, ":", ":", { indent: 0, parentType: "pair", tokenIndex: 0 }),
    ];

    const groups = groupTokens(tokens);

    // Different parent types = no alignment
    assert.strictEqual(groups.length, 0);
  });
});

/**
 * Inline Multi-Property Object Alignment Tests
 *
 * Tests for aligning inline objects like:
 * { key: "orange560", filterName: "Orange560" },
 * { key: "fam",       filterName: "FAM" },
 */
suite("Inline Object Alignment Tests", () => {
  test("inline object colons align by tokenIndex", () => {
    // { key: "a",   filterName: "A" },
    // { key: "bbb", filterName: "BBB" },
    //
    // tokenIndex 0 = first :, tokenIndex 1 = first ,, tokenIndex 2 = second :
    const tokens: AlignmentToken[] = [
      // Line 0: key: at col 6, comma at col 12, filterName: at col 28
      token(0, 6, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(0, 12, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(0, 28, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 2 }),
      // Line 1: key: at col 6, comma at col 14, filterName: at col 28
      token(1, 6, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(1, 14, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(1, 28, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 2 }),
    ];

    const groups = groupTokens(tokens);

    // Should form 3 groups with the bucket-based grouper:
    // Group 1: first colons (type=":", parentType="pair", tokenIndex=0)
    // Group 2: commas (type=",", parentType="inline_object", tokenIndex=1)
    // Group 3: second colons (type=":", parentType="pair", tokenIndex=2)
    assert.strictEqual(groups.length, 3);

    // Verify each group has 2 tokens (one from each line)
    groups.forEach((g) => {
      assert.strictEqual(g.tokens.length, 2);
    });
  });

  test("comma groups use padAfter like colons", () => {
    const tokens: AlignmentToken[] = [
      token(0, 10, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 0,
      }),
      token(1, 15, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 0,
      }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].padAfter, true); // Commas pad after
    // targetColumn = max end position = 15 + 1 = 16
    assert.strictEqual(groups[0].targetColumn, 16);
  });

  test("inline object with 3 properties creates correct groups", () => {
    // { a: 1, b: 2, c: 3 }
    // { aa: 1, bb: 2, cc: 3 }
    //
    // Each line has: colon, comma, colon, comma, colon
    // tokenIndex:      0      1      2      3      4
    const tokens: AlignmentToken[] = [
      // Line 0
      token(0, 4, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(0, 7, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(0, 10, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 2 }),
      token(0, 13, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 3,
      }),
      token(0, 16, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 4 }),
      // Line 1
      token(1, 5, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 0 }),
      token(1, 8, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(1, 12, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 2 }),
      token(1, 15, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 3,
      }),
      token(1, 19, ":", ":", { indent: 2, parentType: "pair", tokenIndex: 4 }),
    ];

    const groups = groupTokens(tokens);

    // Should form 5 groups (one for each unique combination of type+parentType+tokenIndex)
    assert.strictEqual(groups.length, 5);

    // Check that colons and commas are in separate groups
    const colonGroups = groups.filter((g) => g.tokens[0].type === ":");
    const commaGroups = groups.filter((g) => g.tokens[0].type === ",");
    assert.strictEqual(colonGroups.length, 3);
    assert.strictEqual(commaGroups.length, 2);

    // Each group should have 2 tokens (one from each line)
    groups.forEach((g) => {
      assert.strictEqual(g.tokens.length, 2);
    });
  });

  test("inline objects don't align across different parent types", () => {
    // Inline object comma should not align with other commas
    const tokens: AlignmentToken[] = [
      token(0, 10, ",", ",", {
        indent: 2,
        parentType: "inline_object",
        tokenIndex: 0,
      }),
      token(1, 10, ",", ",", {
        indent: 2,
        parentType: "arguments",
        tokenIndex: 0,
      }), // Different parent
    ];

    const groups = groupTokens(tokens);

    // Different parent types = no grouping
    assert.strictEqual(groups.length, 0);
  });

  test("real-world inline object array example", () => {
    // const RESULT_COLUMNS = [
    //   { key: "orange560", filterName: "Orange560", metadataPath: "pcr.orange_ct" },
    //   { key: "fam",       filterName: "FAM",       metadataPath: "pcr.fam_ct" },
    // ];
    //
    // For alignment, we need:
    // - First colon (after key) to align
    // - First comma (after first value) to align - this aligns filterName
    // - Second colon (after filterName) to align
    // - Second comma (after second value) to align - this aligns metadataPath
    // - Third colon (after metadataPath) to align
    const tokens: AlignmentToken[] = [
      // Line 0: "orange560" is longer
      token(0, 6, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }),
      token(0, 18, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(0, 30, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 2 }),
      token(0, 43, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 3,
      }),
      token(0, 57, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 4 }),
      // Line 1: "fam" is shorter - needs padding after comma
      token(1, 6, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 0 }),
      token(1, 12, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
      }),
      token(1, 30, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 2 }),
      token(1, 37, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 3,
      }),
      token(1, 57, ":", ":", { indent: 4, parentType: "pair", tokenIndex: 4 }),
    ];

    const groups = groupTokens(tokens);

    // 5 groups for each unique (type, parentType, tokenIndex)
    assert.strictEqual(groups.length, 5);

    // Check the comma groups have correct padAfter
    const commaGroups = groups.filter((g) => g.tokens[0].type === ",");
    assert.strictEqual(commaGroups.length, 2);
    commaGroups.forEach((g) => {
      assert.strictEqual(g.padAfter, true);
    });

    // First comma group (tokenIndex 1): aligns "fam," with "orange560,"
    // Comma at col 18 on line 0, col 12 on line 1
    // Max end column = max(18+1, 12+1) = max(19, 13) = 19
    const firstCommaGroup = commaGroups.find(
      (g) => g.tokens[0].tokenIndex === 1,
    );
    assert.ok(firstCommaGroup);
    assert.strictEqual(firstCommaGroup!.targetColumn, 19);
  });

  test("tokens from different scopes don't align", () => {
    // This tests the case where two JSX attributes have similar structure:
    // primaryAction={{ label: "Delete" }}
    // secondaryAction={{ label: "Cancel" }}
    //
    // These should NOT align because they're in different object literals
    const tokens: AlignmentToken[] = [
      // primaryAction object - scope "object_1"
      token(0, 20, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
      }),
      // secondaryAction object - scope "object_2"
      token(1, 22, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_2",
      }),
    ];

    const groups = groupTokens(tokens);

    // Different scopes = no grouping, even though everything else matches
    assert.strictEqual(groups.length, 0);
  });

  test("tokens from same scope DO align", () => {
    // Two properties in the SAME object should align
    const tokens: AlignmentToken[] = [
      token(0, 5, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
      }),
      token(1, 10, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
      }),
    ];

    const groups = groupTokens(tokens);

    // Same scope = grouping works
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 2);
  });
});

/**
 * Inline Object Isolation Tests
 *
 * Tests for the rule:
 * - Inline objects (operatorCountOnLine > 1): isolate by line, no cross-object alignment
 * - Multi-line blocks (operatorCountOnLine == 1): use scopeId, allow alignment within block
 */
suite("Inline Object Isolation Tests", () => {
  test("inline objects (2+ ops/line) don't align tokenIndex > 0 across lines", () => {
    // | { type: ActionType.SelectCell; coordinate: CellIndex }
    // | { type: ActionType.ExtendSelection; to: CellIndex }
    //
    // Both have 2 operators, but coordinate: and to: should NOT align
    const tokens: AlignmentToken[] = [
      // Line 0: type: at tokenIndex 0, coordinate: at tokenIndex 1
      token(0, 8, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "union",
        operatorCountOnLine: 2,
      }),
      token(0, 35, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 1,
        scopeId: "union",
        operatorCountOnLine: 2,
      }),
      // Line 1: type: at tokenIndex 0, to: at tokenIndex 1
      token(1, 8, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "union",
        operatorCountOnLine: 2,
      }),
      token(1, 40, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 1,
        scopeId: "union",
        operatorCountOnLine: 2,
      }),
    ];

    const groups = groupTokens(tokens);

    // tokenIndex 0 should form a group (type: aligns)
    const tokenIndex0Groups = groups.filter(
      (g) => g.tokens[0].tokenIndex === 0,
    );
    assert.strictEqual(tokenIndex0Groups.length, 1);
    assert.strictEqual(tokenIndex0Groups[0].tokens.length, 2);

    // tokenIndex 1 should NOT form a group (isolated by line)
    const tokenIndex1Groups = groups.filter(
      (g) => g.tokens[0].tokenIndex === 1,
    );
    assert.strictEqual(tokenIndex1Groups.length, 0);
  });

  test("multi-line blocks (1 op/line) DO align tokenIndex > 0", () => {
    // | {
    //     type: ActionType.LoadData;
    //     rows: CellValue[][];
    //     columns: ColumnConfig[];
    //   }
    //
    // Each line has 1 operator, so they share scope and align
    const tokens: AlignmentToken[] = [
      token(0, 4, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
        operatorCountOnLine: 1,
      }),
      token(1, 4, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
        operatorCountOnLine: 1,
      }),
      token(2, 7, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1",
        operatorCountOnLine: 1,
      }),
    ];

    const groups = groupTokens(tokens);

    // All tokens should form one group
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
  });

  test("tokenIndex 0 always aligns regardless of operatorCountOnLine", () => {
    // Mix of inline objects and single-property lines
    // tokenIndex 0 should still group together
    const tokens: AlignmentToken[] = [
      token(0, 8, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "union",
        operatorCountOnLine: 2, // inline object
      }),
      token(1, 8, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "union",
        operatorCountOnLine: 1, // single property
      }),
      token(2, 8, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "union",
        operatorCountOnLine: 3, // 3-property inline
      }),
    ];

    const groups = groupTokens(tokens);

    // All tokenIndex 0 should form one group
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
  });
});

/**
 * Function Argument Alignment Tests
 *
 * Tests for right-aligning function call arguments across consecutive lines:
 * token(0,  8, ":", ...);  <- 8 gets 1 space before to align with 15
 * token(0, 15, ":", ...);
 */
suite("Function Argument Alignment Tests", () => {
  test("function arguments right-align across consecutive calls", () => {
    // token(0, 8, ":");
    // token(0, 15, ":");
    //
    // Arguments should right-align: 8 and 15 align on their right edge
    const tokens: AlignmentToken[] = [
      // Line 0: token(0, 8, ...)
      // Arg "0" at col 6, arg "8" at col 9
      token(0, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(0, 9, "8", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
      // Line 1: token(0, 15, ...)
      // Arg "0" at col 6, arg "15" at col 9
      token(1, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(1, 9, "15", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
    ];

    const groups = groupTokens(tokens);

    // Should form 2 groups: one for each tokenIndex
    assert.strictEqual(groups.length, 2);

    // Group 0: first arg "0" - same text, same end position
    const group0 = groups.find((g) => g.tokens[0].tokenIndex === 0);
    assert.ok(group0);
    assert.strictEqual(group0!.tokens.length, 2);
    // targetColumn = max end column = max(6+1, 6+1) = 7
    assert.strictEqual(group0!.targetColumn, 7);

    // Group 1: second arg "8" vs "15"
    // "8" at col 9, length 1, ends at 10
    // "15" at col 9, length 2, ends at 11
    // targetColumn = max end = 11
    const group1 = groups.find((g) => g.tokens[0].tokenIndex === 1);
    assert.ok(group1);
    assert.strictEqual(group1!.tokens.length, 2);
    assert.strictEqual(group1!.targetColumn, 11);
  });

  test("function calls with different names don't align", () => {
    // token(0, 8, ...);
    // other(0, 15, ...);
    //
    // Different function names = different scopes = no alignment
    const tokens: AlignmentToken[] = [
      token(0, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token", // Different scope
      }),
      token(1, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_other", // Different scope
      }),
    ];

    const groups = groupTokens(tokens);

    // Different scopes = no grouping
    assert.strictEqual(groups.length, 0);
  });

  test("function calls with different arg counts don't align later args", () => {
    // token(0, 8);       <- 2 args
    // token(0, 15, ":"); <- 3 args
    //
    // Different structures = later args shouldn't align
    const tokens: AlignmentToken[] = [
      // Line 0: token(0, 8) - 2 args
      token(0, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(0, 9, "8", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
      // Line 1: token(0, 15, ":") - 3 args
      token(1, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(1, 9, "15", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
      token(1, 13, '":"', "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 2,
        scopeId: "func_token",
      }),
    ];

    const groups = groupTokens(tokens);

    // tokenIndex 0 and 1 form groups (both have 2 tokens)
    // tokenIndex 2 only has 1 token (no group)
    assert.strictEqual(groups.length, 2);
  });

  test("comment breaks function argument alignment group", () => {
    // token(0, 8, ...);
    // // comment
    // token(1, 15, ...);
    //
    // Non-consecutive lines = separate groups
    const tokens: AlignmentToken[] = [
      token(0, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      // Line 1 is a comment (gap)
      token(2, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
    ];

    const groups = groupTokens(tokens);

    // Non-consecutive = no grouping (each would be singleton, filtered out)
    assert.strictEqual(groups.length, 0);
  });

  test("3 consecutive function calls align all argument positions", () => {
    // token(0, 8, ":");
    // token(1, 15, ":");
    // token(2, 100, ":");
    //
    // All 3 should right-align at each argument position
    const tokens: AlignmentToken[] = [
      // Line 0: args 0, 8
      token(0, 6, "0", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(0, 9, "8", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
      // Line 1: args 1, 15
      token(1, 6, "1", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(1, 9, "15", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
      // Line 2: args 2, 100
      token(2, 6, "2", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func_token",
      }),
      token(2, 9, "100", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 1,
        scopeId: "func_token",
      }),
    ];

    const groups = groupTokens(tokens);

    // 2 groups: one for each tokenIndex
    assert.strictEqual(groups.length, 2);

    // Each group should have 3 tokens (one per line)
    groups.forEach((g) => {
      assert.strictEqual(g.tokens.length, 3);
    });

    // Group for tokenIndex 0: all single-digit, end at 7
    const group0 = groups.find((g) => g.tokens[0].tokenIndex === 0);
    assert.ok(group0);
    assert.strictEqual(group0!.targetColumn, 7);

    // Group for tokenIndex 1: "8" ends at 10, "15" ends at 11, "100" ends at 12
    // targetColumn = max end = 12
    const group1 = groups.find((g) => g.tokens[0].tokenIndex === 1);
    assert.ok(group1);
    assert.strictEqual(group1!.targetColumn, 12);
  });

  test("funcArg tokens don't use padAfter (right-align pads before)", () => {
    const tokens: AlignmentToken[] = [
      token(0, 9, "8", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func",
      }),
      token(1, 9, "15", "funcArg", {
        indent: 2,
        parentType: "function_arguments",
        tokenIndex: 0,
        scopeId: "func",
      }),
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    // funcArg doesn't use padAfter (it pads before for right-alignment)
    assert.strictEqual(groups[0].padAfter, false);
  });
});
