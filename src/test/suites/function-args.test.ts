/**
 * Function Argument Alignment Tests
 *
 * Tests for right-aligning function call arguments across consecutive lines:
 * token(0,  8, ":", ...);  <- 8 gets 1 space before to align with 15
 * token(0, 15, ":", ...);
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

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
