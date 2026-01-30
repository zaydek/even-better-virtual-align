/**
 * Tree-sitter based parsing service.
 *
 * Uses @vscode/tree-sitter-wasm for reliable parsing in VS Code's extension host.
 * Extracts alignable operators while respecting syntax context (ignoring strings, comments).
 */

import * as path from "path";
import * as vscode from "vscode";
import {
  AlignmentToken,
  getParserLanguage,
  OperatorType,
  SupportedLanguage,
} from "../core/types";

// Type definitions matching @vscode/tree-sitter-wasm
interface Point {
  row: number;
  column: number;
}

interface TreeNode {
  id: number;
  type: string;
  text: string;
  startPosition: Point;
  parent: TreeNode | null;
}

interface Tree {
  rootNode: TreeNode;
  delete(): void;
}

interface QueryCapture {
  name: string;
  node: TreeNode;
}

interface Query {
  captures(node: TreeNode): QueryCapture[];
  delete(): void;
}

interface Language {
  query(source: string): Query;
}

interface Parser {
  setLanguage(language: Language): void;
  parse(text: string): Tree | null;
  delete(): void;
}

interface ParserClass {
  init(options?: {
    locateFile: (file: string, folder: string) => string;
  }): Promise<void>;
  new (): Parser;
}

interface LanguageClass {
  load(path: string): Promise<Language>;
}

/**
 * Tree-sitter queries for extracting alignable operators.
 * Each query captures the operator token with @op.
 */
const QUERIES: Record<string, string> = {
  typescript: `
    ; Variable declarations: const x = 1
    (variable_declarator
      name: (_)
      "=" @op
      value: (_))

    ; Assignment expressions: x = 1
    (assignment_expression
      left: (_)
      "=" @op
      right: (_))

    ; Enum member assignments: Up = "up"
    (enum_assignment
      name: (_)
      "=" @op
      value: (_))

    ; Object properties: { key: value }
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: number
    (type_annotation
      ":" @op)

    ; Logical operators
    (binary_expression
      operator: "&&" @op)
    (binary_expression
      operator: "||" @op)

    ; Trailing comments: // comment
    (comment) @op
  `,

  // TSX uses the same query patterns as TypeScript
  tsx: `
    ; Variable declarations: const x = 1
    (variable_declarator
      name: (_)
      "=" @op
      value: (_))

    ; Assignment expressions: x = 1
    (assignment_expression
      left: (_)
      "=" @op
      right: (_))

    ; Enum member assignments: Up = "up"
    (enum_assignment
      name: (_)
      "=" @op
      value: (_))

    ; Object properties: { key: value }
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: number
    (type_annotation
      ":" @op)

    ; Logical operators
    (binary_expression
      operator: "&&" @op)
    (binary_expression
      operator: "||" @op)

    ; Trailing comments: // comment
    (comment) @op
  `,

  python: `
    ; Assignments: x = 1
    (assignment
      left: (_)
      "=" @op
      right: (_))

    ; Keyword arguments: func(x=1)
    (keyword_argument
      name: (_)
      "=" @op
      value: (_))

    ; Default parameters: def foo(x=1)
    (default_parameter
      name: (_)
      "=" @op
      value: (_))

    ; Dictionary pairs: {"key": value}
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: int
    (typed_parameter
      ":" @op)

    ; Boolean operators
    (boolean_operator
      operator: "and" @op)
    (boolean_operator
      operator: "or" @op)

    ; Trailing comments: # comment
    (comment) @op
  `,

  css: `
    ; CSS declarations: property: value
    (declaration
      (property_name)
      ":" @op)
  `,
};

/**
 * WASM file names for each language (from @vscode/tree-sitter-wasm).
 */
const WASM_FILES: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  python: "tree-sitter-python.wasm",
  css: "tree-sitter-css.wasm",
};

export class ParserService {
  private initialized = false;
  private ParserClass: ParserClass | null = null;
  private LanguageClass: LanguageClass | null = null;
  private parser: Parser | null = null;
  private languages: Map<string, Language> = new Map();
  private queries: Map<string, Query> = new Map();
  private wasmDir: string;

  constructor(_context: vscode.ExtensionContext) {
    // Find the wasm directory using require.resolve
    // This works regardless of where the extension is installed
    try {
      const treeSitterPath = require.resolve("@vscode/tree-sitter-wasm");
      this.wasmDir = path.dirname(treeSitterPath);
    } catch {
      // Fallback to extension path
      this.wasmDir = path.join(
        _context.extensionPath,
        "node_modules",
        "@vscode",
        "tree-sitter-wasm",
        "wasm",
      );
    }
    console.log("Even Better Virtual Align: WASM directory:", this.wasmDir);
  }

  /**
   * Initializes the Tree-sitter WASM runtime.
   * Must be called before parsing.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log("Even Better Virtual Align: Initializing Tree-sitter...");

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const treeSitter = require("@vscode/tree-sitter-wasm");
      // The module exports { Parser, Language, Query, ... }
      this.ParserClass = treeSitter.Parser as ParserClass;
      this.LanguageClass = treeSitter.Language as LanguageClass;

      // Initialize tree-sitter with the WASM file location
      await this.ParserClass.init({
        locateFile: (file: string) => {
          const fullPath = path.join(this.wasmDir, file);
          console.log(
            "Even Better Virtual Align: Loading WASM file:",
            fullPath,
          );
          return fullPath;
        },
      });

      this.parser = new this.ParserClass();
      this.initialized = true;
      console.log(
        "Even Better Virtual Align: Tree-sitter initialized successfully",
      );
    } catch (error) {
      console.error(
        "Even Better Virtual Align: Failed to initialize Tree-sitter:",
        error,
      );
      throw error;
    }
  }

  /**
   * Lazily loads a language parser.
   */
  private async loadLanguage(lang: string): Promise<boolean> {
    if (this.languages.has(lang)) {
      return true;
    }

    if (!this.LanguageClass || !this.parser) {
      return false;
    }

    const wasmFile = WASM_FILES[lang];
    if (!wasmFile) {
      // Language not supported by tree-sitter, use regex fallback
      return false;
    }

    try {
      const wasmPath = path.join(this.wasmDir, wasmFile);
      const language = await this.LanguageClass.load(wasmPath);

      this.languages.set(lang, language);

      // Compile query for this language
      const querySource = QUERIES[lang];
      if (querySource) {
        const query = language.query(querySource);
        this.queries.set(lang, query);
      }

      return true;
    } catch (error) {
      console.error(`Failed to load ${lang} parser:`, error);
      return false;
    }
  }

  /**
   * Parses a document and extracts alignable tokens.
   */
  async parse(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
  ): Promise<AlignmentToken[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const langId = document.languageId as SupportedLanguage;
    const parserLang = getParserLanguage(langId);

    // JSON uses regex fallback since @vscode/tree-sitter-wasm doesn't include it
    if (parserLang === "json") {
      return this.parseJsonWithRegex(document, startLine, endLine);
    }

    // YAML uses regex fallback (no WASM grammar available)
    if (parserLang === "yaml") {
      return this.parseYamlWithRegex(document, startLine, endLine);
    }

    // Markdown parses code blocks with supported languages
    if (parserLang === "markdown") {
      return this.parseMarkdownCodeBlocks(document, startLine, endLine);
    }

    // TSX already mapped correctly by getParserLanguage
    const actualLang = parserLang;

    const loaded = await this.loadLanguage(actualLang);
    if (!loaded || !this.parser) {
      return [];
    }

    const language = this.languages.get(actualLang);
    const query = this.queries.get(actualLang);

    if (!language || !query) {
      return [];
    }

    try {
      // Set language and parse
      this.parser.setLanguage(language);
      const text = document.getText();
      const tree = this.parser.parse(text);

      if (!tree) {
        return [];
      }

      const captures = query.captures(tree.rootNode);

      // First pass: collect all valid captures with their metadata
      // We need to sort by column before assigning tokenIndex because
      // Tree-sitter returns captures in AST order, not left-to-right text order
      interface CaptureData {
        line: number;
        column: number;
        text: string;
        type: OperatorType;
        indent: number;
        parentType: string;
        scopeId: string;
      }
      const captureData: CaptureData[] = [];

      for (const capture of captures) {
        const node = capture.node;
        const line = node.startPosition.row;

        // Filter to visible range
        if (line < startLine || line > endLine) {
          continue;
        }

        // Skip if inside a string or comment
        if (this.isInsideStringOrComment(node)) {
          continue;
        }

        const operatorText = node.text;
        const operatorType = this.normalizeOperator(operatorText);

        if (!operatorType) {
          continue;
        }

        // Get indentation level of this line
        const lineText = document.lineAt(line).text;
        const indent = this.getIndentLevel(lineText);

        // For comments, only include trailing comments (code before the comment)
        // Trailing comments use special grouping: ignore scopeId, use "trailing_comment" parentType
        if (operatorType === "//") {
          const column = node.startPosition.column;
          // Check if there's non-whitespace code before the comment
          const beforeComment = lineText.substring(0, column);
          if (beforeComment.trim().length === 0) {
            // This is a standalone comment, not a trailing comment
            continue;
          }

          // Trailing comments group by indent + consecutive lines only
          // Use constant parentType and scopeId to bypass AST-based separation
          captureData.push({
            line,
            column,
            text: "//", // Normalize to just the marker for consistent alignment
            type: operatorType,
            indent,
            parentType: "trailing_comment",
            scopeId: "trailing_comment", // All trailing comments share the same scope
          });
          continue;
        }

        // Get parent type for structural grouping
        const parentType = this.getParentType(node);

        // Get scope ID - tokens in different scopes shouldn't align
        const scopeId = this.getScopeId(node);

        captureData.push({
          line,
          column: node.startPosition.column,
          text: operatorText,
          type: operatorType,
          indent,
          parentType,
          scopeId,
        });
      }

      // Sort by line, then by column (left-to-right order)
      captureData.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });

      // Find inline objects and add comma tokens
      // Group captures by line to detect lines with multiple colons from pairs
      const colonsByLine = new Map<number, CaptureData[]>();
      for (const data of captureData) {
        if (data.type === ":" && data.parentType === "pair") {
          if (!colonsByLine.has(data.line)) {
            colonsByLine.set(data.line, []);
          }
          colonsByLine.get(data.line)!.push(data);
        }
      }

      // For lines with 2+ colons from pairs (inline objects), find commas
      for (const [lineNum, colons] of colonsByLine) {
        if (colons.length < 2) continue;

        // This is an inline object - find commas between pairs
        const lineText = document.lineAt(lineNum).text;
        const commaPositions = this.findInlineObjectCommas(lineText, colons);

        for (const commaCol of commaPositions) {
          captureData.push({
            line: lineNum,
            column: commaCol,
            text: ",",
            type: ",",
            indent: colons[0].indent,
            parentType: "inline_object", // Special parent type for inline object commas
            scopeId: colons[0].scopeId, // Inherit scope from the colons
          });
        }
      }

      // Re-sort after adding commas
      captureData.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });

      // Count operators per line for shape-based grouping
      const operatorCountByLine = new Map<number, number>();
      for (const data of captureData) {
        const count = operatorCountByLine.get(data.line) ?? 0;
        operatorCountByLine.set(data.line, count + 1);
      }

      // Second pass: assign token indices based on sorted order
      const tokens: AlignmentToken[] = [];
      const tokenCountByLine: Map<number, number> = new Map();

      for (const data of captureData) {
        const tokenIndex = tokenCountByLine.get(data.line) ?? 0;
        tokenCountByLine.set(data.line, tokenIndex + 1);

        tokens.push({
          ...data,
          tokenIndex,
          operatorCountOnLine: operatorCountByLine.get(data.line) ?? 1,
        });
      }

      tree.delete();
      return tokens;
    } catch (error) {
      console.error("Parse error:", error);
      return [];
    }
  }

  /**
   * Parses JSON using a state machine to correctly find key-value colons.
   * This handles escaped quotes and other edge cases that regex fails on.
   */
  private parseJsonWithRegex(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
  ): AlignmentToken[] {
    const tokens: AlignmentToken[] = [];

    // Track token index per line
    const tokenCountByLine: Map<number, number> = new Map();

    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      // Only process lines in range
      if (lineNum < startLine || lineNum > endLine) {
        continue;
      }

      const lineText = document.lineAt(lineNum).text;
      const indent = this.getIndentLevel(lineText);

      // Find structural colons using state machine
      const colonPositions = this.findJsonColons(lineText);
      const operatorCountOnLine = colonPositions.length;

      for (const colonIndex of colonPositions) {
        const tokenIndex = tokenCountByLine.get(lineNum) ?? 0;
        tokenCountByLine.set(lineNum, tokenIndex + 1);

        // For JSON without AST, use indent as scope (same indent = same level)
        const scopeId = `json_indent_${indent}`;

        tokens.push({
          line: lineNum,
          column: colonIndex,
          text: ":",
          type: ":",
          indent,
          parentType: "pair",
          tokenIndex,
          scopeId,
          operatorCountOnLine,
        });
      }
    }

    return tokens;
  }

  /**
   * State machine to find structural colons in a JSON line.
   * Correctly handles escaped quotes and colons inside strings.
   */
  private findJsonColons(line: string): number[] {
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

      // Found colon outside string - check if it follows a string key
      if (char === ":" && !inString && lastStringEnd !== -1) {
        // Verify only whitespace between string end and colon
        const between = line.substring(lastStringEnd + 1, i);
        if (/^\s*$/.test(between)) {
          colonPositions.push(i);
        }
        lastStringEnd = -1; // Reset to avoid matching again
      }
    }

    return colonPositions;
  }

  /**
   * Parses YAML using regex (no WASM grammar available).
   * YAML has unquoted keys followed by colons.
   */
  private parseYamlWithRegex(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
  ): AlignmentToken[] {
    const tokens: AlignmentToken[] = [];
    const tokenCountByLine: Map<number, number> = new Map();

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      if (lineNum >= document.lineCount) break;

      const lineText = document.lineAt(lineNum).text;
      const indent = this.getIndentLevel(lineText);

      // Skip comments and empty lines
      const trimmed = lineText.trim();
      if (
        trimmed.startsWith("#") ||
        trimmed === "" ||
        trimmed === "---" ||
        trimmed === "..."
      ) {
        continue;
      }

      // Find key: value patterns
      // Match: word characters (and some special chars) followed by colon
      // Avoid matching URLs (http://, https://) by checking what follows
      const colonPositions = this.findYamlColons(lineText);
      const operatorCountOnLine = colonPositions.length;

      for (const colonIndex of colonPositions) {
        const tokenIndex = tokenCountByLine.get(lineNum) ?? 0;
        tokenCountByLine.set(lineNum, tokenIndex + 1);

        // For YAML without AST, use indent as scope (same indent = same level)
        const scopeId = `yaml_indent_${indent}`;

        tokens.push({
          line: lineNum,
          column: colonIndex,
          text: ":",
          type: ":",
          indent,
          parentType: "pair",
          tokenIndex,
          scopeId,
          operatorCountOnLine,
        });
      }
    }

    return tokens;
  }

  /**
   * Finds structural colons in a YAML line.
   * Handles quoted strings and avoids URLs.
   */
  private findYamlColons(line: string): number[] {
    const colonPositions: number[] = [];
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      // Found colon outside quotes
      if (char === ":" && !inSingleQuote && !inDoubleQuote) {
        // Check it's not a URL (http://, https://, etc.)
        const before = line.substring(0, i);
        if (
          before.endsWith("http") ||
          before.endsWith("https") ||
          before.endsWith("ftp")
        ) {
          continue;
        }

        // Check there's a key before the colon (word characters)
        const keyMatch = before.match(/[\w\-_.]+\s*$/);
        if (keyMatch) {
          colonPositions.push(i);
        }
      }
    }

    return colonPositions;
  }

  /**
   * Parses markdown files by extracting and parsing fenced code blocks
   * with supported language identifiers.
   */
  private async parseMarkdownCodeBlocks(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
  ): Promise<AlignmentToken[]> {
    const text = document.getText();
    const lines = text.split("\n");
    const tokens: AlignmentToken[] = [];

    // Map of language aliases to our supported languages
    const langAliases: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      typescript: "typescript",
      typescriptreact: "tsx",
      js: "typescript", // Parse JS with TS parser
      javascript: "typescript",
      json: "json",
      jsonc: "json",
      yaml: "yaml",
      yml: "yaml",
      python: "python",
      py: "python",
      css: "css",
      scss: "css",
      less: "css",
    };

    // Find all fenced code blocks
    const codeBlocks: Array<{
      lang: string;
      startLine: number;
      endLine: number;
      content: string;
    }> = [];

    let inBlock = false;
    let blockLang = "";
    let blockStartLine = 0;
    let blockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!inBlock && trimmed.startsWith("```")) {
        // Start of code block
        const langMatch = trimmed.match(/^```(\w+)/);
        if (langMatch) {
          const lang = langMatch[1].toLowerCase();
          if (langAliases[lang]) {
            inBlock = true;
            blockLang = langAliases[lang];
            blockStartLine = i + 1; // Content starts on next line
            blockContent = [];
          }
        }
      } else if (inBlock && trimmed === "```") {
        // End of code block
        if (blockContent.length > 0) {
          codeBlocks.push({
            lang: blockLang,
            startLine: blockStartLine,
            endLine: i - 1,
            content: blockContent.join("\n"),
          });
        }
        inBlock = false;
        blockLang = "";
        blockContent = [];
      } else if (inBlock) {
        blockContent.push(line);
      }
    }

    // Parse each code block with its appropriate parser
    for (const block of codeBlocks) {
      // Skip blocks outside the visible range
      if (block.endLine < startLine || block.startLine > endLine) {
        continue;
      }

      // Each code block gets a unique scope to prevent cross-block alignment
      const blockScopeId = `md_block_${block.startLine}`;

      const blockTokens = await this.parseCodeBlockContent(
        block.content,
        block.lang,
        block.startLine,
        blockScopeId,
      );

      tokens.push(...blockTokens);
    }

    return tokens;
  }

  /**
   * Parses the content of a code block with the appropriate language parser.
   * Returns tokens with line numbers adjusted to the document.
   */
  private async parseCodeBlockContent(
    content: string,
    lang: string,
    lineOffset: number,
    blockScopeId: string,
  ): Promise<AlignmentToken[]> {
    const tokens: AlignmentToken[] = [];

    // Use the appropriate parser based on language
    if (lang === "json") {
      // Parse JSON with regex
      const lines = content.split("\n");
      const tokenCountByLine: Map<number, number> = new Map();

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const docLine = lineOffset + i;
        const colonPositions = this.findJsonColons(lineText);
        const indent = this.getIndentLevel(lineText);
        const operatorCountOnLine = colonPositions.length;

        for (const colonPos of colonPositions) {
          const tokenIndex = tokenCountByLine.get(docLine) ?? 0;
          tokenCountByLine.set(docLine, tokenIndex + 1);

          // Use block scope + indent for scoping within the block
          const scopeId = `${blockScopeId}_indent_${indent}`;

          tokens.push({
            line: docLine,
            column: colonPos,
            text: ":",
            type: ":",
            indent,
            parentType: "pair",
            tokenIndex,
            scopeId,
            operatorCountOnLine,
          });
        }
      }
    } else if (lang === "yaml") {
      // Parse YAML with regex
      const lines = content.split("\n");
      const tokenCountByLine: Map<number, number> = new Map();

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const docLine = lineOffset + i;
        const colonPositions = this.findYamlColons(lineText);
        const indent = this.getIndentLevel(lineText);

        // Skip comments and empty lines
        const trimmed = lineText.trim();
        if (
          trimmed.startsWith("#") ||
          trimmed === "" ||
          trimmed === "---" ||
          trimmed === "..."
        ) {
          continue;
        }

        const operatorCountOnLine = colonPositions.length;

        for (const colonPos of colonPositions) {
          const tokenIndex = tokenCountByLine.get(docLine) ?? 0;
          tokenCountByLine.set(docLine, tokenIndex + 1);

          // Use block scope + indent for scoping within the block
          const scopeId = `${blockScopeId}_indent_${indent}`;

          tokens.push({
            line: docLine,
            column: colonPos,
            text: ":",
            type: ":",
            indent,
            parentType: "pair",
            tokenIndex,
            scopeId,
            operatorCountOnLine,
          });
        }
      }
    } else {
      // Use Tree-sitter for other languages
      const loaded = await this.loadLanguage(lang);
      if (!loaded || !this.parser) {
        return tokens;
      }

      const language = this.languages.get(lang);
      const query = this.queries.get(lang);

      if (!language || !query) {
        return tokens;
      }

      try {
        this.parser.setLanguage(language);
        const tree = this.parser.parse(content);

        if (!tree) {
          return tokens;
        }

        const captures = query.captures(tree.rootNode);
        const lines = content.split("\n");

        interface CaptureData {
          line: number;
          column: number;
          text: string;
          type: OperatorType;
          indent: number;
          parentType: string;
          scopeId: string;
        }
        const captureData: CaptureData[] = [];

        for (const capture of captures) {
          const node = capture.node;
          const blockLine = node.startPosition.row;
          const docLine = lineOffset + blockLine;

          if (this.isInsideStringOrComment(node)) {
            continue;
          }

          const operatorText = node.text;
          const operatorType = this.normalizeOperator(operatorText);

          if (!operatorType) {
            continue;
          }

          const lineText = lines[blockLine] || "";
          const indent = this.getIndentLevel(lineText);

          // For comments, only include trailing comments (code before the comment)
          if (operatorType === "//") {
            const column = node.startPosition.column;
            const beforeComment = lineText.substring(0, column);
            if (beforeComment.trim().length === 0) {
              continue;
            }

            // Trailing comments group by indent + consecutive lines only
            captureData.push({
              line: docLine,
              column,
              text: "//",
              type: operatorType,
              indent,
              parentType: "trailing_comment",
              scopeId: `${blockScopeId}_trailing_comment`,
            });
            continue;
          }

          const parentType = this.getParentType(node);

          // Combine block scope with AST scope for fine-grained grouping
          const astScopeId = this.getScopeId(node);
          const scopeId = `${blockScopeId}_${astScopeId}`;

          captureData.push({
            line: docLine,
            column: node.startPosition.column,
            text: operatorText,
            type: operatorType,
            indent,
            parentType,
            scopeId,
          });
        }

        // Find inline objects and add comma tokens
        const colonsByLine = new Map<number, CaptureData[]>();
        for (const data of captureData) {
          if (data.type === ":" && data.parentType === "pair") {
            if (!colonsByLine.has(data.line)) {
              colonsByLine.set(data.line, []);
            }
            colonsByLine.get(data.line)!.push(data);
          }
        }

        for (const [docLine, colons] of colonsByLine) {
          if (colons.length < 2) continue;

          const blockLine = docLine - lineOffset;
          const lineText = lines[blockLine] || "";
          const commaPositions = this.findInlineObjectCommas(lineText, colons);

          for (const commaCol of commaPositions) {
            captureData.push({
              line: docLine,
              column: commaCol,
              text: ",",
              type: ",",
              indent: colons[0].indent,
              parentType: "inline_object",
              scopeId: colons[0].scopeId, // Inherit scope from colons
            });
          }
        }

        // Sort and assign token indices
        captureData.sort((a, b) => {
          if (a.line !== b.line) return a.line - b.line;
          return a.column - b.column;
        });

        // Count operators per line for shape-based grouping
        const operatorCountByLine = new Map<number, number>();
        for (const data of captureData) {
          const count = operatorCountByLine.get(data.line) ?? 0;
          operatorCountByLine.set(data.line, count + 1);
        }

        const tokenCountByLine: Map<number, number> = new Map();
        for (const data of captureData) {
          const tokenIndex = tokenCountByLine.get(data.line) ?? 0;
          tokenCountByLine.set(data.line, tokenIndex + 1);

          tokens.push({
            ...data,
            tokenIndex,
            operatorCountOnLine: operatorCountByLine.get(data.line) ?? 1,
          });
        }

        tree.delete();
      } catch (error) {
        console.error("Error parsing code block:", error);
      }
    }

    return tokens;
  }

  /**
   * Finds commas between pairs in an inline object.
   * Given colon positions, finds the commas that separate the value from the next key.
   */
  private findInlineObjectCommas(
    lineText: string,
    colons: { column: number }[],
  ): number[] {
    const commaPositions: number[] = [];

    // Sort colons by column position
    const sortedColons = [...colons].sort((a, b) => a.column - b.column);

    // For each pair of adjacent colons, find the comma between them
    for (let i = 0; i < sortedColons.length - 1; i++) {
      const currentColonCol = sortedColons[i].column;
      const nextColonCol = sortedColons[i + 1].column;

      // Search for comma between current colon and next colon
      const commaCol = this.findCommaBetween(
        lineText,
        currentColonCol + 1,
        nextColonCol,
      );
      if (commaCol !== null) {
        commaPositions.push(commaCol);
      }
    }

    return commaPositions;
  }

  /**
   * Finds the structural comma between two positions in a line.
   * Handles strings and nested structures.
   */
  private findCommaBetween(
    line: string,
    startCol: number,
    endCol: number,
  ): number | null {
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0; // Track nested braces/brackets

    for (let i = startCol; i < endCol && i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'" || char === "`") && !inString) {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === stringChar && inString) {
        inString = false;
        stringChar = "";
        continue;
      }

      if (inString) continue;

      // Track nesting
      if (char === "{" || char === "[" || char === "(") {
        depth++;
        continue;
      }
      if (char === "}" || char === "]" || char === ")") {
        depth--;
        continue;
      }

      // Found a comma at top level
      if (char === "," && depth === 0) {
        return i;
      }
    }

    return null;
  }

  /**
   * Checks if a node is inside a string or comment.
   */
  private isInsideStringOrComment(node: TreeNode): boolean {
    const ignoredTypes = new Set([
      "string",
      "template_string",
      "string_literal",
      "comment",
      "line_comment",
      "block_comment",
      "string_fragment",
      "interpolation",
      "formatted_string",
    ]);

    let current: TreeNode | null = node.parent;
    while (current) {
      if (ignoredTypes.has(current.type)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Normalizes operator text to a canonical type.
   */
  private normalizeOperator(text: string): OperatorType | null {
    switch (text) {
      case "=":
        return "=";
      case ":":
        return ":";
      case ",":
        return ",";
      case "&&":
        return "&&";
      case "||":
        return "||";
      case "and":
        return "and";
      case "or":
        return "or";
      default:
        // Check for comments (// ... or # ...)
        if (text.startsWith("//") || text.startsWith("#")) {
          return "//";
        }
        return null;
    }
  }

  /**
   * Gets the indentation level (leading whitespace count) of a line.
   */
  private getIndentLevel(lineText: string): number {
    const match = lineText.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Gets the AST parent type for structural grouping.
   * Tokens with different parent types should not align.
   */
  private getParentType(node: TreeNode): string {
    // The parent of the operator tells us its structural role
    // e.g., "pair" for JSON objects, "property_signature" for TS interfaces
    return node.parent?.type ?? "unknown";
  }

  /**
   * Gets a scope identifier for context-aware grouping.
   * Tokens in different scopes (different objects, blocks) shouldn't align.
   */
  private getScopeId(node: TreeNode): string {
    const scopeTypes = new Set([
      "object",
      "object_pattern",
      "array",
      "statement_block",
      "block",
      "class_body",
      "dictionary",
      "list",
      "function_definition",
      "class_definition",
      "if_statement",
      "for_statement",
      "while_statement",
    ]);

    let current: TreeNode | null = node.parent;
    while (current) {
      if (scopeTypes.has(current.type)) {
        // Use node ID as unique scope identifier
        return `${current.type}_${current.id}`;
      }
      current = current.parent;
    }
    return "root";
  }

  /**
   * Disposes parser resources.
   */
  dispose(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
    for (const query of this.queries.values()) {
      query.delete();
    }
    this.languages.clear();
    this.queries.clear();
  }
}
