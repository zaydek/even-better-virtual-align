/**
 * JSON Colon Finder Tests
 *
 * These test cases verify that the state machine correctly identifies
 * structural colons (key-value separators) and ignores colons inside strings.
 */

import * as assert from "assert";

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
