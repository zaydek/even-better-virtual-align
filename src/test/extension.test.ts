/**
 * Tests for Alignment Sanity extension.
 */

import * as assert from "assert";
import { AlignmentToken } from "../core/types";
import { groupTokens } from "../logic/Grouper";

suite("Grouper Tests", () => {
  test("groups consecutive tokens with same type and scope", () => {
    const tokens: AlignmentToken[] = [
      { line: 0, column: 10, text: "=", type: "=", scopeId: "root" },
      { line: 1, column: 5, text: "=", type: "=", scopeId: "root" },
      { line: 2, column: 8, text: "=", type: "=", scopeId: "root" },
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
    assert.strictEqual(groups[0].targetColumn, 10); // max column
  });

  test("separates tokens with different types", () => {
    const tokens: AlignmentToken[] = [
      { line: 0, column: 5, text: "=", type: "=", scopeId: "root" },
      { line: 1, column: 5, text: ":", type: ":", scopeId: "root" },
    ];

    const groups = groupTokens(tokens);

    // Each token is alone, so no groups (groups require 2+ tokens)
    assert.strictEqual(groups.length, 0);
  });

  test("separates tokens with different scopes", () => {
    const tokens: AlignmentToken[] = [
      { line: 0, column: 5, text: ":", type: ":", scopeId: "object_1" },
      { line: 1, column: 8, text: ":", type: ":", scopeId: "object_1" },
      { line: 3, column: 3, text: ":", type: ":", scopeId: "object_2" },
      { line: 4, column: 6, text: ":", type: ":", scopeId: "object_2" },
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].tokens.length, 2);
    assert.strictEqual(groups[0].targetColumn, 8);
    assert.strictEqual(groups[1].tokens.length, 2);
    assert.strictEqual(groups[1].targetColumn, 6);
  });

  test("breaks group on line gap > 1", () => {
    const tokens: AlignmentToken[] = [
      { line: 0, column: 5, text: "=", type: "=", scopeId: "root" },
      { line: 1, column: 5, text: "=", type: "=", scopeId: "root" },
      // Gap of 2 lines
      { line: 4, column: 5, text: "=", type: "=", scopeId: "root" },
      { line: 5, column: 5, text: "=", type: "=", scopeId: "root" },
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
      { line: 0, column: 5, text: "=", type: "=", scopeId: "root" },
    ];

    const groups = groupTokens(tokens);
    assert.strictEqual(groups.length, 0);
  });

  test("handles unsorted input", () => {
    const tokens: AlignmentToken[] = [
      { line: 2, column: 8, text: "=", type: "=", scopeId: "root" },
      { line: 0, column: 10, text: "=", type: "=", scopeId: "root" },
      { line: 1, column: 5, text: "=", type: "=", scopeId: "root" },
    ];

    const groups = groupTokens(tokens);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].tokens.length, 3);
    // Should be sorted by line in the output
    assert.strictEqual(groups[0].tokens[0].line, 0);
    assert.strictEqual(groups[0].tokens[1].line, 1);
    assert.strictEqual(groups[0].tokens[2].line, 2);
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

  test("getParserLanguage maps language IDs correctly", () => {
    const { getParserLanguage } = require("../core/types");

    assert.strictEqual(getParserLanguage("typescript"), "typescript");
    assert.strictEqual(getParserLanguage("typescriptreact"), "typescript");
    assert.strictEqual(getParserLanguage("json"), "json");
    assert.strictEqual(getParserLanguage("jsonc"), "json");
    assert.strictEqual(getParserLanguage("python"), "python");
  });
});

suite("Debounce Tests", () => {
  test("debounce delays function execution", (done) => {
    const { debounce } = require("../utils/debounce");

    let callCount = 0;
    const fn = debounce(() => {
      callCount++;
    }, 50);

    fn();
    fn();
    fn();

    // Should not have been called yet
    assert.strictEqual(callCount, 0);

    setTimeout(() => {
      assert.strictEqual(callCount, 1);
      done();
    }, 100);
  });

  test("debounce cancel prevents execution", (done) => {
    const { debounce } = require("../utils/debounce");

    let callCount = 0;
    const fn = debounce(() => {
      callCount++;
    }, 50);

    fn();
    fn.cancel();

    setTimeout(() => {
      assert.strictEqual(callCount, 0);
      done();
    }, 100);
  });
});
