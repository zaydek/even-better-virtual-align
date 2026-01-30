# Agent Rules

## VSIX Files

- Only keep the **current version** `.vsix` file in the repository
- Delete old `.vsix` files when bumping versions
- The current `.vsix` should match the version in `package.json`
- Regenerate with: `npx @vscode/vsce package --allow-missing-repository`
