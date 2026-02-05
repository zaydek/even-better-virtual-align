# Agent Rules

## Testing and Installation

After making changes, **always run tests and reinstall** to avoid stale behavior:

```bash
# Run unit tests (fast, no VS Code window)
npm run test:unit

# Rebuild and reinstall extension
npm run compile && npx @vscode/vsce package --allow-missing-repository && code --install-extension even-better-virtual-align-3.0.0.vsix --force
```

Then reload VS Code: **Cmd+Shift+P → "Developer: Reload Window"**

## VSIX Files

- Only keep the **current version** `.vsix` file in the repository
- Delete old `.vsix` files when bumping versions
- The current `.vsix` should match the version in `package.json`
- Regenerate with: `npx @vscode/vsce package --allow-missing-repository`

## README.md

- **DO NOT run Prettier or any formatter on README.md**
- The code examples contain intentional alignment spacing
- A `.prettierignore` file is in place to prevent this
