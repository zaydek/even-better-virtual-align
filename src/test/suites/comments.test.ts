/**
 * Trailing Comment Alignment Tests
 *
 * Tests for aligning trailing comments (// and #) at the end of lines.
 * Comments should align at the rightmost visual column, accounting for
 * any padding added by other operators on the same line.
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

suite("Trailing Comment Alignment Tests", () => {
  test("trailing comments group together when on consecutive lines", () => {
    // enum EnumStatus {
    //   Uploading = "uploading", // comment 1
    //   Complete  = "complete",  // comment 2
    //   Error     = "error",     // comment 3
    // }
    const tokens: AlignmentToken[] = [
      // Comments use special parentType and scopeId
      token(1, 28, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(2, 28, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(3, 22, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
    ];

    const groups = groupTokens(tokens);

    // All comments should be in one group
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
    // Comments pad BEFORE (like =), so padAfter = false
    assert.strictEqual(groups[0].padAfter, false);
    // Target column = max column = 28
    assert.strictEqual(groups[0].targetColumn, 28);
  });

  test("trailing comments with different indents don't group", () => {
    const tokens: AlignmentToken[] = [
      token(0, 20, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(1, 25, "//", "//", {
        indent: 4, // Different indent
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
    ];

    const groups = groupTokens(tokens);

    // Different indents = no grouping
    assert.strictEqual(groups.length, 0);
  });

  test("trailing comments at DIFFERENT columns but SAME indent DO group", () => {
    // This is the critical test for enum/type trailing comments
    // Comments are at different source columns but same indent level
    // They should still group together
    const tokens: AlignmentToken[] = [
      // Simulating:
      //   Uploading = "uploading", // comment <- column 27
      //   Complete = "complete", // comment   <- column 25
      //   Error = "error", // comment         <- column 19
      token(1, 27, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(2, 25, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(3, 19, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
    ];

    const groups = groupTokens(tokens);

    // All comments should be in ONE group (same indent, consecutive lines)
    assert.strictEqual(groups.length, 1, "Should have 1 comment group");
    assert.strictEqual(
      groups[0].tokens.length,
      3,
      "Group should have 3 tokens",
    );

    // Target column should be the MAX (rightmost) = 27
    assert.strictEqual(
      groups[0].targetColumn,
      27,
      "Target should be rightmost column",
    );

    // padAfter should be false for comments (pad BEFORE to push right)
    assert.strictEqual(groups[0].padAfter, false, "Comments should pad before");
  });

  test("trailing comments with DIFFERENT tokenIndex values still group", () => {
    // This tests a critical bug: lines with different numbers of operators
    // have different tokenIndex values for their trailing comments.
    //
    // Example type definition:
    //   open:              boolean; // comment                    <- 2 ops (: //), tokenIndex=1
    //   onOpenChange:      (open: boolean) => void; // comment    <- 3 ops (: => //), tokenIndex=2
    //   secondaryAction?:  { label: string; onClick?: () => void }; // comment <- 5 ops, tokenIndex=4
    //
    // The bug: tokenIndex was used in the grouping key, so comments ended up
    // in different buckets based on how many operators preceded them.
    const tokens: AlignmentToken[] = [
      // Line 1: simple type - 2 operators (: and //)
      token(1, 12, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "type_1",
        operatorCountOnLine: 2,
      }),
      token(1, 22, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 1, // Second operator
        scopeId: "trailing_comment",
        operatorCountOnLine: 2,
      }),
      // Line 2: function type - 3 operators (: => //)
      token(2, 15, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "type_1",
        operatorCountOnLine: 3,
      }),
      token(2, 45, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 2, // Third operator (different from line 1!)
        scopeId: "trailing_comment",
        operatorCountOnLine: 3,
      }),
      // Line 3: inline object type - 5 operators (: : => : //)
      token(3, 18, ":", ":", {
        indent: 2,
        parentType: "pair",
        tokenIndex: 0,
        scopeId: "type_1",
        operatorCountOnLine: 5,
      }),
      token(3, 60, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 4, // Fifth operator (very different!)
        scopeId: "trailing_comment",
        operatorCountOnLine: 5,
      }),
    ];

    const groups = groupTokens(tokens);

    // Find comment groups
    const commentGroups = groups.filter((g) => g.tokens[0].type === "//");

    // Should have exactly 1 comment group with all 3 comments
    assert.strictEqual(commentGroups.length, 1, "Should have 1 comment group");
    assert.strictEqual(
      commentGroups[0].tokens.length,
      3,
      "Comment group should have all 3 comments despite different tokenIndex values",
    );

    // Target should be the max column (60)
    assert.strictEqual(
      commentGroups[0].targetColumn,
      60,
      "Target should be rightmost comment column",
    );
  });

  test("trailing comments with operatorCountOnLine > 1 still group (THE BUG FIX)", () => {
    // This tests the critical bug: when a line has multiple operators (like = and //),
    // the inline object isolation logic was incorrectly isolating each comment by line.
    //
    // Example:
    //   Uploading = "uploading", // comment  <- 2 operators: = and //
    //   Complete = "complete", // comment    <- 2 operators: = and //
    //   Error = "error", // comment          <- 2 operators: = and //
    //
    // The bug: operatorCountOnLine > 1 triggered line isolation for comments,
    // making each comment its own bucket, so they never grouped.
    const tokens: AlignmentToken[] = [
      // Line 1: = and //
      token(1, 12, "=", "=", {
        indent: 2,
        parentType: "enum_assignment",
        tokenIndex: 0,
        scopeId: "enum_1",
        operatorCountOnLine: 2,
      }),
      token(1, 27, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 1, // Second operator on line
        scopeId: "trailing_comment",
        operatorCountOnLine: 2,
      }),
      // Line 2: = and //
      token(2, 11, "=", "=", {
        indent: 2,
        parentType: "enum_assignment",
        tokenIndex: 0,
        scopeId: "enum_1",
        operatorCountOnLine: 2,
      }),
      token(2, 25, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 1,
        scopeId: "trailing_comment",
        operatorCountOnLine: 2,
      }),
      // Line 3: = and //
      token(3, 8, "=", "=", {
        indent: 2,
        parentType: "enum_assignment",
        tokenIndex: 0,
        scopeId: "enum_1",
        operatorCountOnLine: 2,
      }),
      token(3, 19, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 1,
        scopeId: "trailing_comment",
        operatorCountOnLine: 2,
      }),
    ];

    const groups = groupTokens(tokens);

    // Should have 2 groups: one for = operators, one for // comments
    assert.strictEqual(groups.length, 2, "Should have 2 groups (= and //)");

    // Find the comment group
    const commentGroup = groups.find((g) => g.tokens[0].type === "//");
    assert.ok(commentGroup, "Should have a comment group");
    assert.strictEqual(
      commentGroup!.tokens.length,
      3,
      "Comment group should have all 3 comments",
    );

    // Target should be the max column (27)
    assert.strictEqual(
      commentGroup!.targetColumn,
      27,
      "Comment target should be rightmost column",
    );
  });

  test("enum with = operators and trailing comments: shift calculation", () => {
    // This tests the bug scenario:
    // Source positions (before virtual alignment):
    //   Empty = "empty", // comment        <- = at col 8, // at col 19
    //   Uploading = "uploading", // comment <- = at col 12, // at col 27
    //
    // After = alignment (padding before =):
    //   Empty's = gets 4 spaces padding -> shift = 4
    //   Uploading's = needs 0 padding -> shift = 0
    //
    // Comment visual positions:
    //   Empty: 19 + 4 = 23
    //   Uploading: 27 + 0 = 27
    //
    // Target = 27, so Empty needs 4 more spaces

    // First, test that = operators group correctly
    const equalsTokens: AlignmentToken[] = [
      token(0, 8, "=", "=", {
        indent: 2,
        parentType: "enum_assignment",
        tokenIndex: 0,
        scopeId: "enum_1",
      }),
      token(1, 12, "=", "=", {
        indent: 2,
        parentType: "enum_assignment",
        tokenIndex: 0,
        scopeId: "enum_1",
      }),
    ];

    const equalsGroups = groupTokens(equalsTokens);
    assert.strictEqual(equalsGroups.length, 1);
    assert.strictEqual(equalsGroups[0].targetColumn, 12); // Max column
    assert.strictEqual(equalsGroups[0].padAfter, false); // Pad before

    // Check individual token padding needs
    const eqGroup = equalsGroups[0];
    // Token at col 8 needs 12 - 8 = 4 spaces
    assert.strictEqual(eqGroup.targetColumn - eqGroup.tokens[0].column, 4);
    // Token at col 12 needs 12 - 12 = 0 spaces
    assert.strictEqual(eqGroup.targetColumn - eqGroup.tokens[1].column, 0);

    // Now test comments
    const commentTokens: AlignmentToken[] = [
      token(0, 19, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
      token(1, 27, "//", "//", {
        indent: 2,
        parentType: "trailing_comment",
        tokenIndex: 0,
        scopeId: "trailing_comment",
      }),
    ];

    const commentGroups = groupTokens(commentTokens);
    assert.strictEqual(commentGroups.length, 1);
    // Target = max column = 27
    assert.strictEqual(commentGroups[0].targetColumn, 27);

    // The DecorationManager should compute:
    // Line 0: visual = 19 + shift(4) = 23, needs 27 - 23 = 4 spaces
    // Line 1: visual = 27 + shift(0) = 27, needs 0 spaces
    // But we can't test DecorationManager directly without mocking vscode
  });
});
