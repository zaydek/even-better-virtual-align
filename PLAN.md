# PLAN: Decouple Tests from VS Code

## Goal

Run unit tests with plain Node.js/Mocha without opening VS Code Extension Development Host window.

## Current Problem

Tests require VS Code because:

1. `ParserService.parse()` takes `vscode.TextDocument` as input
2. Tests use `vscode.workspace.openTextDocument()` to create documents
3. WASM path resolution uses `vscode.ExtensionContext`

This means every test run opens a VS Code window, which is slow (~10s startup) and annoying.

## Solution: Adapter Pattern

Per LLM Council recommendation (unanimous, high tractability, 2-4 hours estimated).

### Step 1: Define Interface (no VS Code imports)

Add to `src/core/types.ts`:

```typescript
export interface ParseableDocument {
  readonly languageId: string;
  getText(): string;
  readonly lineCount: number;
}

export interface ParserConfig {
  wasmDir: string;
}
```

### Step 2: Refactor ParserService

Change constructor and `parse()` signature:

```typescript
// Before
constructor(context: vscode.ExtensionContext)
async parse(document: vscode.TextDocument, ...)

// After
constructor(config: ParserConfig)
async parse(doc: ParseableDocument, ...)
```

Use `web-tree-sitter` directly with `locateFile` callback for Node.js compatibility:

```typescript
await Parser.init({
  locateFile: (scriptName: string) => {
    return path.join(this.config.wasmDir, scriptName);
  },
});
```

### Step 3: Create VS Code Adapter

New file `src/adapters/VSCodeDocumentAdapter.ts`:

```typescript
import * as vscode from "vscode";
import { ParseableDocument } from "../core/types";

export class VSCodeDocumentAdapter implements ParseableDocument {
  constructor(private readonly document: vscode.TextDocument) {}

  get languageId() {
    return this.document.languageId;
  }
  get lineCount() {
    return this.document.lineCount;
  }
  getText() {
    return this.document.getText();
  }
}
```

### Step 4: Update extension.ts

```typescript
const wasmDir = path.join(
  context.extensionPath,
  "node_modules",
  "@vscode",
  "tree-sitter-wasm",
  "wasm"
);
const parserService = new ParserService({ wasmDir });

// Usage
const docAdapter = new VSCodeDocumentAdapter(editor.document);
parserService.parse(docAdapter, 0, docAdapter.lineCount);
```

### Step 5: Create Mock for Tests

```typescript
// src/test/mocks/MockDocument.ts
export function createMockDocument(
  content: string,
  languageId: string
): ParseableDocument {
  const lines = content.split("\n");
  return {
    languageId,
    lineCount: lines.length,
    getText: () => content,
  };
}
```

### Step 6: Add Unit Test Script

In `package.json`:

```json
{
  "scripts": {
    "test:unit": "mocha -r ts-node/register src/test/unit/**/*.test.ts"
  }
}
```

### Step 7: Migrate fixture tests

Update `fixtures.test.ts` to use `createMockDocument()` instead of `vscode.workspace.openTextDocument()`.

## Tree-sitter WASM Gotchas

1. **`locateFile` Hook**: Required in Node.js to return absolute path to `tree-sitter.wasm`
2. **Language Loading**: `Parser.Language.load()` requires absolute file paths in Node.js
3. **Memory Management**: Call `.delete()` on Trees in long-running tests (optional for short tests)
4. **Library Choice**: Use `web-tree-sitter` directly, not `@vscode/tree-sitter-wasm` in core

## Checklist

- [x] Add `ParseableDocument` interface to `types.ts`
- [x] Add `ParserConfig` interface to `types.ts`
- [x] Refactor `ParserService` to remove all `vscode` imports
- [x] Create `VSCodeDocumentAdapter`
- [x] Update `extension.ts` to use adapter
- [x] Create `MockDocument` helper
- [x] Add `test:unit` script to `package.json`
- [x] Migrate `fixtures.test.ts` to use mock documents
- [x] Verify WASM files are locatable in tests
- [x] Run tests without VS Code window opening

## Outcome

**COMPLETED** - All goals achieved.

- Test execution: ~5s → **1.1s** (4.5x faster)
- CI stability: No Xvfb/display server needed for `npm run test:unit`
- Developer experience: Fast iteration with `npm run test:unit`

### Usage

```bash
# Run fixture tests without VS Code (fast, 1.1s)
npm run test:unit

# Run full test suite with VS Code Extension Host (slower, 5s)
npm test
```
