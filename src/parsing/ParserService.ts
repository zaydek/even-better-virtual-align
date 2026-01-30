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
  `,
};

/**
 * WASM file names for each language (from @vscode/tree-sitter-wasm).
 */
const WASM_FILES: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  python: "tree-sitter-python.wasm",
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
    console.log("Alignment Sanity: WASM directory:", this.wasmDir);
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
      console.log("Alignment Sanity: Initializing Tree-sitter...");

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const treeSitter = require("@vscode/tree-sitter-wasm");
      // The module exports { Parser, Language, Query, ... }
      this.ParserClass = treeSitter.Parser as ParserClass;
      this.LanguageClass = treeSitter.Language as LanguageClass;

      // Initialize tree-sitter with the WASM file location
      await this.ParserClass.init({
        locateFile: (file: string) => {
          const fullPath = path.join(this.wasmDir, file);
          console.log("Alignment Sanity: Loading WASM file:", fullPath);
          return fullPath;
        },
      });

      this.parser = new this.ParserClass();
      this.initialized = true;
      console.log("Alignment Sanity: Tree-sitter initialized successfully");
    } catch (error) {
      console.error(
        "Alignment Sanity: Failed to initialize Tree-sitter:",
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
      const tokens: AlignmentToken[] = [];

      // Track token index per line (for multi-operator lines like { x: 1, y: 2 })
      const tokenCountByLine: Map<number, number> = new Map();

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

        // Get parent type for structural grouping
        const parentType = this.getParentType(node);

        // Get token index on this line
        const tokenIndex = tokenCountByLine.get(line) ?? 0;
        tokenCountByLine.set(line, tokenIndex + 1);

        tokens.push({
          line,
          column: node.startPosition.column,
          text: operatorText,
          type: operatorType,
          indent,
          parentType,
          tokenIndex,
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

      for (const colonIndex of colonPositions) {
        const tokenIndex = tokenCountByLine.get(lineNum) ?? 0;
        tokenCountByLine.set(lineNum, tokenIndex + 1);

        tokens.push({
          line: lineNum,
          column: colonIndex,
          text: ":",
          type: ":",
          indent,
          parentType: "pair",
          tokenIndex,
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
      if (trimmed.startsWith("#") || trimmed === "" || trimmed === "---" || trimmed === "...") {
        continue;
      }

      // Find key: value patterns
      // Match: word characters (and some special chars) followed by colon
      // Avoid matching URLs (http://, https://) by checking what follows
      const colonPositions = this.findYamlColons(lineText);

      for (const colonIndex of colonPositions) {
        const tokenIndex = tokenCountByLine.get(lineNum) ?? 0;
        tokenCountByLine.set(lineNum, tokenIndex + 1);

        tokens.push({
          line: lineNum,
          column: colonIndex,
          text: ":",
          type: ":",
          indent,
          parentType: "pair",
          tokenIndex,
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
        if (before.endsWith("http") || before.endsWith("https") || before.endsWith("ftp")) {
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
      case "&&":
        return "&&";
      case "||":
        return "||";
      case "and":
        return "and";
      case "or":
        return "or";
      default:
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
