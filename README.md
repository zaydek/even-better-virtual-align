# Alignment Sanity

Virtual code alignment for VS Code and Cursor — **without modifying your files**.

Aligns operators like `=`, `:`, `&&`, `||`, `and`, `or` visually in the editor while keeping the actual file untouched. No more whitespace pollution in your git diffs.

## Features

- **Zero file modifications** — alignment is purely visual via editor decorations
- **Go-style alignment** — colons attach to keys, values align; equals signs align together
- **Multi-language support** — TypeScript, TSX, JSON, YAML, Python
- **Smart grouping** — only aligns related code (same indentation, same context, consecutive lines)
- **Tree-sitter powered** — reliable AST-based parsing, not fragile regex

## Examples

**JSON / YAML** — values align (Go style):
```json
{
  "name":        "alignment-sanity",
  "version":     "2.9.0",
  "description": "Virtual code alignment"
}
```

**Python** — operators align:
```python
passes   = sum(1 for s in results if s == "pass")
warnings = sum(1 for s in results if s == "warn")
fails    = sum(1 for s in results if s == "fail")
```

**TypeScript** — mixed operators:
```typescript
const classes = [
  isError    && "text-red",
  isWarning  && "text-yellow",
  isSuccess  && "text-green",
]
```

## Installation

Download the latest `.vsix` from [Releases](https://github.com/zaydek/alignment-sanity/releases) and install:

```bash
# Cursor
cursor --install-extension alignment-sanity-2.9.0.vsix

# VS Code
code --install-extension alignment-sanity-2.9.0.vsix
```

## Usage

The extension activates automatically for supported file types.

### Toggle Alignment

- **Keyboard**: `⌘⇧A` (Cmd+Shift+A)
- **Command Palette**: `Alignment Sanity: Toggle`
- **Status Bar**: Click the "✓ Align" / "✗ Align" indicator

### Commands

| Command | Description |
|---------|-------------|
| `Alignment Sanity: Toggle` | Switch alignment on/off |
| `Alignment Sanity: Enable` | Explicitly enable |
| `Alignment Sanity: Disable` | Explicitly disable |

## Supported Languages

| Language | Operators |
|----------|-----------|
| TypeScript / TSX | `=` `:` `&&` `\|\|` |
| JSON / JSONC | `:` |
| YAML | `:` |
| Python | `=` `:` `and` `or` |

## How It Works

1. **Tree-sitter parsing** — The document is parsed into an AST to find operators in their proper context
2. **Smart grouping** — Operators are grouped by type, indentation, AST parent, and consecutive lines (like `gofmt`)
3. **Visual decorations** — VS Code decorations insert invisible spacing to align text without changing the file

## Alignment Style

The extension uses Go-style alignment rules:

- **For `:`** — Colon stays attached to the key, padding is added *after* to align values
- **For `=`, `&&`, `||`** — Padding is added *before* to align the operators themselves

This matches how `gofmt` formats Go code.

## Credits

Inspired by [virtual-better-align](https://github.com/hborchardt/virtual-better-align) by [@hborchardt](https://github.com/hborchardt).

Rebuilt from scratch with Tree-sitter for reliability and multi-language support.

## License

MIT
