/**
 * Inline Object Alignment Tests
 *
 * Tests for aligning inline objects like:
 * { key: "orange560", filterName: "Orange560" },
 * { key: "fam",       filterName: "FAM" },
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

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
