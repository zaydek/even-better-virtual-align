# Alignment Sanity

**The readability of vertical alignment. The cleanliness of zero git diffs.**

[![VS Code](https://img.shields.io/badge/VS%20Code-Compatible-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-purple)](https://cursor.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

**Alignment Sanity** gives you perfectly aligned code **without polluting your git history**. Using VS Code's decoration API, alignment is rendered purely visually—your files stay exactly as they are on disk.

![Alignment Sanity Demo](images/tutorial.gif)

## The Problem

Vertical alignment makes code easier to scan, but inserting actual spaces causes issues:

- **Noisy Git Diffs:** Changing one variable name forces you to realign 10 other lines.
- **Formatter Conflicts:** Prettier, Black, and other formatters fight against manual alignment.
- **Team Friction:** "To align or not to align" becomes a debate.

## The Solution

Alignment Sanity renders alignment **visually** while keeping your files untouched.

| What You See (Virtual) | What Is Saved (Disk) |
| :--- | :--- |
| `name:    "app"` | `name: "app"` |
| `version: "1.0"` | `version: "1.0"` |
| `debug:   true` | `debug: true` |

**Your git diff:** Clean. Zero changes.

---

## Key Features

- **Zero File Modifications:** Alignment is purely visual. Your git diffs remain pristine.
- **Tree-sitter Powered:** Uses robust AST parsing instead of fragile regex. It understands context, scope, and structure.
- **Smart Grouping:** Only aligns related code (same indentation, same AST context, consecutive lines).
- **Go-Style Rules:**
  - **Colons (`:`)**: Attached to the key; padding added *after* to align values.
  - **Operators (`=`, `&&`, `||`)**: Padding added *before* to align the operators.
- **Multi-Language:** Native support for TypeScript, TSX, JSON, YAML, Python, CSS, SCSS, and Less.

---

## Visual Examples

### Data & Configuration

*Perfect for aligning keys in JSON, YAML, and TypeScript interfaces. Padding added **after** colons.*

**Package Configuration** (JSON)
```json
{
  "name":        "enterprise-dashboard",
  "version":     "2.4.0",
  "description": "Real-time analytics and monitoring platform",
  "main":        "dist/server.js",
  "license":     "MIT",
  "private":     true
}
```

**Kubernetes Spec** (YAML)
```yaml
spec:
  replicas:        3
  strategy:        RollingUpdate
  revisionHistory: 10
  selector:
    app:           backend
    tier:          production
```

**Type Definitions** (TypeScript)
```typescript
interface UserProfile {
  id:              string;
  email:           string;
  displayName:     string;
  avatarUrl:       string | null;
  isVerified:      boolean;
  lastLogin:       Date;
  role:            "admin" | "editor" | "viewer";
}
```

### Logic & Conditions

*Clarify complex logic by aligning operators. Padding added **before** `=`, `&&`, `||`, etc.*

**Environment Setup** (Python)
```python
DEBUG        = os.getenv("DEBUG", "false") == "true"
SECRET_KEY   = os.getenv("SECRET_KEY", "dev-secret")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///app.db")
REDIS_HOST   = os.getenv("REDIS_HOST", "localhost")
API_TIMEOUT  = int(os.getenv("API_TIMEOUT", "30"))
```

**Conditional Classes** (TSX / React)
```tsx
const buttonClasses = clsx(
  "px-4 py-2 rounded transition-all",
  isPrimary    && "bg-blue-600 text-white hover:bg-blue-700",
  isSecondary  && "bg-gray-100 text-gray-900 hover:bg-gray-200",
  isLoading    && "opacity-75 cursor-wait",
  isDisabled   && "opacity-50 pointer-events-none"
);
```

**Guard Clauses** (TypeScript)
```typescript
const canSubmit =
  isFormValid              &&
  !isSubmitting            &&
  hasAgreedToTerms         &&
  (hasCredit || isFreeTier);
```

### Styling & Theming

*Create clean, readable style definitions and token maps.*

**Component Styles** (CSS)
```css
.card-container {
  position:        relative;
  display:         flex;
  flex-direction:  column;
  padding:         1.5rem;
  background:      var(--surface-1);
  border-radius:   0.5rem;
  box-shadow:      0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

**Design Tokens** (SCSS)
```scss
$color-primary:   #3b82f6;
$color-danger:    #ef4444;
$color-success:   #22c55e;
$spacing-unit:    0.25rem;
$font-stack:      'Inter', system-ui, sans-serif;
```

**Responsive Breakpoints** (Less)
```less
@screen-sm:       640px;
@screen-md:       768px;
@screen-lg:       1024px;
@screen-xl:       1280px;
@container-max:   1440px;
```

---

## Supported Languages & Operators

| Language | Extension | Aligned Operators |
| :--- | :--- | :--- |
| **TypeScript / TSX** | `.ts`, `.tsx` | `=`, `:`, `&&`, `\|\|` |
| **JSON / JSONC** | `.json`, `.jsonc` | `:` |
| **YAML** | `.yaml`, `.yml` | `:` |
| **Python** | `.py` | `=`, `:`, `and`, `or` |
| **CSS / SCSS / Less** | `.css`, `.scss`, `.less` | `:` |

---

## Usage

| Action | Command / Shortcut |
| :--- | :--- |
| **Toggle** | `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Win/Linux) |
| **Enable** | Command Palette → `Alignment Sanity: Enable` |
| **Disable** | Command Palette → `Alignment Sanity: Disable` |

**Status Bar:** Look for the "✓ Align" / "✗ Align" indicator in the bottom right.

---

## Configuration

You can enable or disable alignment for specific languages in your `settings.json`:

```json
{
  "alignmentSanity.enabledLanguages": {
    "typescript": true,
    "typescriptreact": true,
    "json": true,
    "jsonc": true,
    "yaml": true,
    "python": true,
    "css": true,
    "scss": true,
    "less": true
  }
}
```

Set any language to `false` to disable alignment for that language.

---

## Installation

### From VSIX (Releases)

1. Download the `.vsix` file from the [Releases page](https://github.com/zaydek/alignment-sanity/releases).
2. Run the install command:

```bash
# For VS Code
code --install-extension alignment-sanity-*.vsix

# For Cursor
cursor --install-extension alignment-sanity-*.vsix
```

---

## Credits

Inspired by [virtual-better-align](https://github.com/hborchardt/virtual-better-align). Rebuilt from scratch using **Tree-sitter** for reliable, AST-based parsing.

---

<p align="center">
  <strong>Clean diffs. Aligned code. Zero compromises.</strong>
</p>
