/**
 * Array of Inline Objects Alignment Tests
 *
 * Tests for aligning inline objects that are siblings in an array:
 * [
 *   { groupName: "key",       elementNamePattern: "^key$" },
 *   { groupName: "ref",       elementNamePattern: "^ref$" },
 *   { groupName: "className", elementNamePattern: "^className$" },
 * ]
 *
 * Each inline object is a separate AST node, but they should align because
 * they're consecutive siblings in the same array with the same shape.
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

suite("Array of Inline Objects Alignment Tests", () => {
  test("inline objects in array with different scopeIds don't align (grouper behavior)", () => {
    // This tests the grouper behavior: tokens with different scopeIds don't group.
    // The FIX is in the ParserService - it should assign the SAME scopeId
    // (the array's scope) to inline objects that are siblings in an array.
    //
    // This test verifies the grouper correctly separates different scopes.
    // A separate integration test verifies the parser assigns shared scopes.
    const tokens: AlignmentToken[] = [
      // Line 0: { groupName: "key", elementNamePattern: "^key$" }
      token(0, 14, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1", // Different scope
        operatorCountOnLine: 2,
      }),
      // Line 1: { groupName: "ref", elementNamePattern: "^ref$" }
      token(1, 14, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_2", // Different scope
        operatorCountOnLine: 2,
      }),
    ];

    const groups = groupTokens(tokens);

    // Grouper correctly separates different scopeIds
    assert.strictEqual(
      groups.length,
      0,
      "Different scopeIds should not group together",
    );
  });

  test("inline objects with SAME scopeId DO align (control test)", () => {
    // This is the control test - if we force the same scopeId, alignment works
    const tokens: AlignmentToken[] = [
      // Line 0
      token(0, 14, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_siblings", // Same scope!
        operatorCountOnLine: 2,
      }),
      // Line 1
      token(1, 14, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_siblings", // Same scope!
        operatorCountOnLine: 2,
      }),
    ];

    const groups = groupTokens(tokens);

    // With same scopeId, tokenIndex 0 should group
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 2);
  });

  test("ESLint config pattern: customGroups array alignment", () => {
    // Real-world example from the screenshot:
    // customGroups: [
    //   { groupName: "key",       elementNamePattern: "^key$" },
    //   { groupName: "ref",       elementNamePattern: "^ref$" },
    //   { groupName: "id",        elementNamePattern: "^id$" },
    //   { groupName: "className", elementNamePattern: "^className$" },
    // ]
    //
    // Expected alignment:
    // - All "groupName:" colons align (tokenIndex 0)
    // - All commas after values align (tokenIndex 1) - pads "key" to match "className"
    // - All "elementNamePattern:" colons align (tokenIndex 2)
    //
    // NOTE: scopeId starts with "array_" to trigger array sibling alignment
    const tokens: AlignmentToken[] = [
      // Line 0: "key"
      token(0, 14, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_123", // Array scope triggers sibling alignment
        operatorCountOnLine: 3,
      }),
      token(0, 20, ",", ",", {
        indent: 6,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      token(0, 42, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      // Line 1: "ref"
      token(1, 14, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      token(1, 20, ",", ",", {
        indent: 6,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      token(1, 42, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      // Line 2: "className" (longest)
      token(2, 14, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      token(2, 26, ",", ",", {
        indent: 6,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
      token(2, 48, ":", ":", {
        indent: 6,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_123",
        operatorCountOnLine: 3,
      }),
    ];

    const groups = groupTokens(tokens);

    // With array scope, ALL operators should align across lines:
    // - tokenIndex 0 (first colons): 1 group with 3 tokens
    // - tokenIndex 1 (commas): 1 group with 3 tokens
    // - tokenIndex 2 (second colons): 1 group with 3 tokens
    assert.strictEqual(
      groups.length,
      3,
      "Should have 3 groups (2 colons + 1 comma)",
    );

    // Group for first colons (tokenIndex 0)
    const colonGroup0 = groups.find(
      (g) => g.tokens[0].type === ":" && g.tokens[0].tokenIndex === 0,
    );
    assert.ok(colonGroup0, "Should have a group for first colons");
    assert.strictEqual(colonGroup0!.tokens.length, 3);
    // All at same column, so targetColumn = 14 + 1 = 15 (padAfter)
    assert.strictEqual(colonGroup0!.targetColumn, 15);

    // Group for commas (tokenIndex 1)
    const commaGroup = groups.find((g) => g.tokens[0].type === ",");
    assert.ok(commaGroup, "Should have a group for commas");
    assert.strictEqual(commaGroup!.tokens.length, 3);
    // Commas at col 20, 20, 26 - max end = 27 (padAfter)
    assert.strictEqual(commaGroup!.targetColumn, 27);

    // Group for second colons (tokenIndex 2)
    const colonGroup2 = groups.find(
      (g) => g.tokens[0].type === ":" && g.tokens[0].tokenIndex === 2,
    );
    assert.ok(colonGroup2, "Should have a group for second colons");
    assert.strictEqual(colonGroup2!.tokens.length, 3);
    // Colons at col 42, 42, 48 - max end = 49 (padAfter)
    assert.strictEqual(colonGroup2!.targetColumn, 49);
  });

  test("array sibling inline objects: full alignment for all token indices", () => {
    // When inline objects share an array scope (array_* or list_*),
    // ALL their tokens should align, not just tokenIndex 0
    //
    // [
    //   { a: 1,   b: 10  },
    //   { a: 100, b: 1   },
    // ]
    const tokens: AlignmentToken[] = [
      // Line 0: { a: 1, b: 10 }
      token(0, 6, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
      token(0, 9, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
      token(0, 12, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
      // Line 1: { a: 100, b: 1 }
      token(1, 6, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
      token(1, 11, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
      token(1, 14, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_42",
        operatorCountOnLine: 3,
      }),
    ];

    const groups = groupTokens(tokens);

    // Should form 3 groups: 2 for colons, 1 for commas
    assert.strictEqual(groups.length, 3);

    // All groups should have 2 tokens (one per line)
    groups.forEach((g) => {
      assert.strictEqual(g.tokens.length, 2);
    });
  });
});

/**
 * Inline Object Comma Detection Tests
 *
 * Tests to verify that inline object comma detection works correctly.
 */
suite("Inline Object Comma Detection Tests", () => {
  // Simulate the findInlineObjectCommas and findCommaBetween logic
  function findCommaBetween(
    line: string,
    startCol: number,
    endCol: number,
  ): number | null {
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0;

    for (let i = startCol; i < endCol && i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'" || char === "`") && !inString) {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === stringChar && inString) {
        inString = false;
        stringChar = "";
        continue;
      }

      if (inString) continue;

      if (char === "{" || char === "[" || char === "(") {
        depth++;
        continue;
      }
      if (char === "}" || char === "]" || char === ")") {
        depth--;
        continue;
      }

      if (char === "," && depth === 0) {
        return i;
      }
    }

    return null;
  }

  function findInlineObjectCommas(
    lineText: string,
    colons: { column: number }[],
  ): number[] {
    const commaPositions: number[] = [];
    const sortedColons = [...colons].sort((a, b) => a.column - b.column);

    for (let i = 0; i < sortedColons.length - 1; i++) {
      const currentColonCol = sortedColons[i].column;
      const nextColonCol = sortedColons[i + 1].column;

      const commaCol = findCommaBetween(
        lineText,
        currentColonCol + 1,
        nextColonCol,
      );
      if (commaCol !== null) {
        commaPositions.push(commaCol);
      }
    }

    return commaPositions;
  }

  test("detects comma between two colons in inline object", () => {
    const line = '  { groupName: "key", elementNamePattern: "^key$" },';
    const colons = [{ column: 13 }, { column: 41 }]; // positions of the two colons

    const commas = findInlineObjectCommas(line, colons);

    // Should find one comma at position 20 (after "key")
    assert.strictEqual(commas.length, 1);
    assert.strictEqual(line[commas[0]], ",");
  });

  test("handles multiple inline objects on different lines", () => {
    const lines = [
      '  { groupName: "key",       elementNamePattern: "^key$" },',
      '  { groupName: "ref",       elementNamePattern: "^ref$" },',
      '  { groupName: "className", elementNamePattern: "^className$" },',
    ];

    // Find colon positions for each line
    const colonPositions = lines.map((line) => {
      const positions: number[] = [];
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inString = !inString;
        if (line[i] === ":" && !inString) positions.push(i);
      }
      return positions;
    });

    // Find commas for each line
    const commasPerLine = lines.map((line, idx) => {
      const colons = colonPositions[idx].map((col) => ({ column: col }));
      return findInlineObjectCommas(line, colons);
    });

    // Each line should have exactly 1 comma
    commasPerLine.forEach((commas, lineIdx) => {
      assert.strictEqual(
        commas.length,
        1,
        `Line ${lineIdx} should have 1 comma, got ${commas.length}`,
      );
    });
  });

  test("grouping works with array scope and varying value lengths", () => {
    // This simulates what the parser SHOULD produce for the customGroups array
    // The key insight: all tokens should share the same array scopeId
    const tokens: AlignmentToken[] = [
      // Line 0: { groupName: "key", elementNamePattern: "^key$" }
      // "key" is short, comma at col 20
      token(0, 13, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      token(0, 20, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      token(0, 41, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      // Line 1: { groupName: "ref", elementNamePattern: "^ref$" }
      // "ref" is short, comma at col 20
      token(1, 13, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_100", // SAME array scope!
        operatorCountOnLine: 3,
      }),
      token(1, 20, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      token(1, 41, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      // Line 2: { groupName: "className", elementNamePattern: "^className$" }
      // "className" is long, comma at col 26
      token(2, 13, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      token(2, 26, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
      token(2, 53, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "array_100",
        operatorCountOnLine: 3,
      }),
    ];

    const groups = groupTokens(tokens);

    // Should have 3 groups: first colons, commas, second colons
    assert.strictEqual(groups.length, 3, "Should have 3 groups");

    // First colons (tokenIndex 0)
    const firstColons = groups.find(
      (g) => g.tokens[0].type === ":" && g.tokens[0].tokenIndex === 0,
    );
    assert.ok(firstColons, "Should have first colons group");
    assert.strictEqual(firstColons!.tokens.length, 3);
    // All at column 13, so target = 14 (padAfter)
    assert.strictEqual(firstColons!.targetColumn, 14);

    // Commas (tokenIndex 1)
    const commas = groups.find((g) => g.tokens[0].type === ",");
    assert.ok(commas, "Should have commas group");
    assert.strictEqual(commas!.tokens.length, 3);
    // Commas at 20, 20, 26 - max end = 27
    assert.strictEqual(commas!.targetColumn, 27);

    // Second colons (tokenIndex 2)
    const secondColons = groups.find(
      (g) => g.tokens[0].type === ":" && g.tokens[0].tokenIndex === 2,
    );
    assert.ok(secondColons, "Should have second colons group");
    assert.strictEqual(secondColons!.tokens.length, 3);
    // Colons at 41, 41, 53 - max end = 54
    assert.strictEqual(secondColons!.targetColumn, 54);
  });

  test("BUG REPRO: different scopeIds prevent alignment", () => {
    // This is likely what's happening in the real parser:
    // Each inline object gets its own scopeId instead of the array's scopeId
    const tokens: AlignmentToken[] = [
      // Line 0: object_1
      token(0, 13, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_1", // BUG: should be array scope
        operatorCountOnLine: 3,
      }),
      token(0, 20, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "object_1",
        operatorCountOnLine: 3,
      }),
      token(0, 41, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "object_1",
        operatorCountOnLine: 3,
      }),
      // Line 1: object_2 (DIFFERENT scope!)
      token(1, 13, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "object_2", // BUG: different scope!
        operatorCountOnLine: 3,
      }),
      token(1, 20, ",", ",", {
        indent: 4,
        parentType: "inline_object",
        tokenIndex: 1,
        scopeId: "object_2",
        operatorCountOnLine: 3,
      }),
      token(1, 41, ":", ":", {
        indent: 4,
        parentType: "pair",
        tokenIndex: 2,
        scopeId: "object_2",
        operatorCountOnLine: 3,
      }),
    ];

    const groups = groupTokens(tokens);

    // With different scopeIds, NO groups should form
    // (each token is alone in its scope, can't form a group with just 1)
    assert.strictEqual(
      groups.length,
      0,
      "BUG CONFIRMED: Different scopeIds prevent grouping",
    );
  });
});
