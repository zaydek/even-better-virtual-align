#!/usr/bin/env node
/**
 * Patches @vscode/tree-sitter-wasm to fix its UMD wrapper bug.
 * The package's UMD wrapper doesn't properly export to CommonJS -
 * it calls factory(exports) but the factory ignores the parameter
 * and returns an object that's never assigned.
 */
const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@vscode",
  "tree-sitter-wasm",
  "wasm",
  "tree-sitter.js",
);

if (!fs.existsSync(filePath)) {
  console.log("tree-sitter.js not found, skipping patch");
  process.exit(0);
}

let content = fs.readFileSync(filePath, "utf8");

// Check if already patched
if (content.includes("Object.assign(exports, factory())")) {
  console.log("tree-sitter.js already patched");
  process.exit(0);
}

// The bug: factory(exports) passes exports but factory ignores it and returns an object
// The fix: capture the return value and assign it to exports
const original = `typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :`;
const patched = `typeof exports === 'object' && typeof module !== 'undefined' ? Object.assign(exports, factory()) :`;

if (!content.includes(original)) {
  console.error("Could not find pattern to patch in tree-sitter.js");
  process.exit(1);
}

content = content.replace(original, patched);
fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully patched tree-sitter.js for CommonJS exports");
