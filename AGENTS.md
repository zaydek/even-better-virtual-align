# Agent Rules

## VSIX Files

- Only keep the **current version** `.vsix` file in the repository
- Delete old `.vsix` files when bumping versions
- The current `.vsix` should match the version in `package.json`
- Regenerate with: `npx @vscode/vsce package --allow-missing-repository`

## README.md

- **DO NOT run Prettier or any formatter on README.md**
- The code examples contain intentional alignment spacing
- A `.prettierignore` file is in place to prevent this
