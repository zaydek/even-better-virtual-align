/**
 * Gofmt-style Alignment Integration Tests
 *
 * These test real-world scenarios to ensure the complete pipeline works correctly.
 */

import * as assert from "assert";
import { AlignmentToken } from "../../core/types";
import { groupTokens } from "../../logic/Grouper";
import { token } from "../test-helpers";

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
