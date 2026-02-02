# Fixture-Based Testing System

## Vision

Make alignment behavior **trivially auditable** through declarative before/after text files.

Instead of reading imperative test code to understand what alignment does, you look at two files:

```
before.ts.txt  →  after.ts.txt
```

The before shows source code. The after shows the same code with `·` marking where virtual padding is inserted.

## Core Principle

**Everything that CAN be a declarative test SHOULD be a declarative test.**

Fixtures are the **primary** testing approach. If alignment behavior can be expressed as "given this input, expect this output," it belongs in a fixture—not in imperative test code.

Imperative tests are a **last resort** for things that genuinely cannot be expressed as before/after:
- Internal function unit tests (e.g., edge cases in `groupTokens()`)
- Error handling and exception paths
- State management logic

The goal is to **maximize** fixtures and **minimize** imperative tests.

## Goals

1. **Readable**: Anyone can understand alignment behavior by comparing before/after files
2. **Maintainable**: Adding a test = adding a folder with two `.txt` files
3. **Auditable**: Git diffs show exactly how alignment behavior changed
4. **Tooling-friendly**: Both files use `.txt` so Prettier/ESLint don't interfere
5. **Comprehensive**: All alignment scenarios should have a corresponding fixture

## Naming Convention

```
src/test/fixtures/
  {language}/
    {test-name}/
      before.{lang}.txt    ← Source code (before alignment)
      after.{lang}.txt     ← Expected output (with · for padding)
      config.json          ← (Optional) Extension settings overrides
```

Examples:
- `before.ts.txt` / `after.ts.txt` for TypeScript
- `before.json.txt` / `after.json.txt` for JSON
- `before.yaml.txt` / `after.yaml.txt` for YAML

**Configuration:** If a test requires specific extension settings, include a `config.json`. The runner will merge these into the default configuration before execution.

## Padding Marker

Virtual padding spaces are shown as `·` (middle dot, U+00B7).

```typescript
// before.ts.txt
const x = 1;
const foo = 2;

// after.ts.txt
const x ··= 1;
const foo = 2;
```

The `··` means 2 virtual spaces are inserted before the `=` on line 1.

**Edge case:** If source code contains a literal `·` character, it will appear in both before and after files. Only `·` characters that appear in `after` but not in `before` (at the same position) represent virtual padding.

## Usage

### Run Tests

```bash
npm test
```

### Update Expected Files

After changing alignment logic, regenerate all `after.*.txt` files:

```bash
UPDATE_SNAPSHOTS=1 npm test
```

Then review the git diff to verify the changes are correct.

### Add a New Test

```bash
# 1. Create the fixture folder
mkdir -p src/test/fixtures/typescript/my-new-test

# 2. Add the before file
cat > src/test/fixtures/typescript/my-new-test/before.ts.txt << 'EOF'
const short = 1;
const longerName = 2;
EOF

# 3. Generate the after file
UPDATE_SNAPSHOTS=1 npm test

# 4. Review and commit
git diff src/test/fixtures/typescript/my-new-test/after.ts.txt
```

## Test Runner

The test runner (`src/test/fixtures.test.ts`):

1. Auto-discovers all fixture folders under `src/test/fixtures/`
2. For each fixture:
   - Reads `before.{lang}.txt`
   - Normalizes line endings to `\n` (cross-platform compatibility)
   - Loads optional `config.json` for settings overrides
   - Parses through real `ParserService` (not mocks)
   - Groups tokens with `groupTokens()`
   - Applies alignment, inserting `·` for padding
   - Compares to `after.{lang}.txt` (strict comparison)

**Note:** The `after.{lang}.txt` file represents the **visual state** (what the user sees with decorations applied), not the file content on disk. The extension uses virtual decorations—it never modifies the actual file.

## Language Support

| Extension | Language ID |
|-----------|-------------|
| `.ts.txt` | typescript |
| `.tsx.txt` | typescriptreact |
| `.json.txt` | json |
| `.yaml.txt` | yaml |
| `.py.txt` | python |
| `.css.txt` | css |

## Why `.txt` for Both Files?

1. **Prettier won't auto-format** the intentional spacing in before files
2. **ESLint won't complain** about the `·` characters in after files
3. **Symmetric naming** makes the before/after relationship obvious
4. **Git treats them as text** for clean diffs

## Relationship to Imperative Tests

Fixtures are the **primary** testing approach:
- Test the full pipeline (parser → grouper → alignment)
- Cover all alignment scenarios that users care about
- Serve as documentation of expected behavior

Imperative tests (`src/test/suites/*.test.ts`) are **secondary**:
- Only for internal logic that can't be shown as before/after
- Examples: grouper bucket logic, error handling, edge cases in helper functions
- Should be minimal—if you can express it as a fixture, do that instead

**Rule of thumb**: If a test describes "when I have this code, it should align like this," it's a fixture. If it describes "when this internal function receives X, it returns Y," it might need to be imperative.
