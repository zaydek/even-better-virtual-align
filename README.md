# Alignment Sanity

A VS Code/Cursor extension that visually aligns `=`, `:`, `&&`, and `||` operators **without modifying your files**.

![Tutorial](https://github.com/hborchardt/virtual-better-align/blob/main/images/tutorial.gif?raw=true)

## Why?

Vertical alignment makes code easier to scan. But inserting actual spaces pollutes your git diffs with whitespace changes on unrelated lines.

This extension shifts text visually in the editor only—the file on disk stays untouched.

## What's different from the original?

This is based on [hborchardt/virtual-better-align](https://github.com/hborchardt/virtual-better-align) with these changes:

- **TypeScript/TSX only** — won't activate for other file types
- **Ignores comments** — lines starting with `//`, `/*`, `*` are skipped
- **Aligns `&&` and `||`** — useful for conditional class arrays:

```typescript
const classes = [
  isUnrecognized               && "header--unrecognized",
  hasErrors && !isUnrecognized && "header--error",
  isEditing                    && "header--editing",
  isSelected                   && "header--selected",
]
```

## Installation

```bash
curl -LO https://raw.githubusercontent.com/zaydek/alignment-sanity/main/alignment-sanity-1.0.0.vsix
cursor --install-extension alignment-sanity-1.0.0.vsix
```

Or for VS Code:
```bash
code --install-extension alignment-sanity-1.0.0.vsix
```

## Usage

The extension activates automatically for `.ts` and `.tsx` files.

Toggle it off/on via Command Palette: **"Alignment Sanity: Toggle active"**

## Credits

Original extension by [@hborchardt](https://github.com/hborchardt) — [virtual-better-align](https://github.com/hborchardt/virtual-better-align)

## License

MIT
