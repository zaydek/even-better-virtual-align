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

// Import extracted modules
import {
  getParentType,
  getScopeId,
  isInsideStringOrComment,
  normalizeOperator,
} from "./ast-utils";
import { QUERIES, WASM_FILES } from "./queries";
import { getIndentLevel } from "./text-utils";
import {
  Language,
  LanguageClass,
  Parser,
  ParserClass,
  Query,
  TreeNode,
} from "./tree-sitter-types";

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

        const operatorText = node.text;
        const operatorType = normalizeOperator(operatorText);

        // Skip if inside a string or comment (but NOT if we're capturing the comment itself)
        if (operatorType !== "//" && isInsideStringOrComment(node)) {
          continue;
        }

        if (!operatorType) {
          continue;
        }

        // Get indentation level of this line
        const lineText = document.lineAt(line).text;
        const indent = getIndentLevel(lineText);

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
        const parentType = getParentType(node);

        // Get scope ID - tokens in different scopes shouldn't align
        const scopeId = getScopeId(node);

        // DEBUG: Log non-array scopes for pair colons
        if (
          operatorType === ":" &&
          parentType === "pair" &&
          !scopeId.startsWith("array_")
        ) {
          console.log(`EBVA: Non-array scope at L${line}: ${scopeId}`);
        }

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
      // Group captures by line AND DEPTH to handle nested objects separately
      // Each depth level gets its own alignment scope
      const colonsByLineAndDepth = new Map<string, CaptureData[]>();
      for (const data of captureData) {
        if (data.type === ":" && data.parentType === "pair") {
          const lineText = document.lineAt(data.line).text;
          const braceDepth = this.getBraceDepthAtColumn(lineText, data.column);
          
          // Group by line AND depth
          const key = `${data.line}:${braceDepth}`;
          if (!colonsByLineAndDepth.has(key)) {
            colonsByLineAndDepth.set(key, []);
          }
          colonsByLineAndDepth.get(key)!.push(data);
        }
      }
      
      // Also maintain colonsByLine for backward compatibility (outer objects only)
      const colonsByLine = new Map<number, CaptureData[]>();
      for (const [key, colons] of colonsByLineAndDepth) {
        const [lineStr, depthStr] = key.split(":");
        const line = parseInt(lineStr);
        const depth = parseInt(depthStr);
        if (depth === 1) {
          colonsByLine.set(line, colons);
        }
      }

      // DEBUG: Write IMMEDIATELY to confirm extension is running
      const fs = require("fs");
      const debugPath = "/tmp/ebva-inline-debug.txt";
      fs.writeFileSync(
        debugPath,
        `Extension running! captureData=${captureData.length}, colonsByLine entries=${colonsByLine.size}\n`,
      );

      // Log all colons with their parentType
      for (const data of captureData) {
        if (data.type === ":") {
          fs.appendFileSync(
            debugPath,
            `  L${data.line}:${data.column} parentType="${data.parentType}" scope="${data.scopeId}"\n`,
          );
        }
      }

      // Track which lines have inline objects at each depth
      const inlineObjectLineDepths = new Set<string>();

      // Process ALL depth levels, not just depth 1
      for (const [key, colons] of colonsByLineAndDepth) {
        if (colons.length < 2) continue;

        const [lineStr, depthStr] = key.split(":");
        const lineNum = parseInt(lineStr);
        const depth = parseInt(depthStr);

        inlineObjectLineDepths.add(key);

        // DEBUG: Write to file
        fs.appendFileSync(
          debugPath,
          `INLINE L${lineNum} D${depth}: ${colons.length} colons, scope="${colons[0].scopeId}"\n`,
        );

        const lineText = document.lineAt(lineNum).text;
        
        // Create depth-specific scope for proper grouping
        const depthScopeId = `${colons[0].scopeId}_depth${depth}`;

        // For depth 1 (outermost objects): find commas between pairs
        if (depth === 1) {
          const commaPositions = this.findInlineObjectCommas(lineText, colons);

          for (const commaCol of commaPositions) {
            captureData.push({
              line: lineNum,
              column: commaCol,
              text: ",",
              type: ",",
              indent: colons[0].indent,
              parentType: "inline_object",
              scopeId: depthScopeId,
            });
          }
        }

        // Find closing brace for this depth level (only for depth 1 outer objects)
        if (depth === 1) {
          const closingBraceCol = this.findClosingBraceAtDepth(lineText, colons, depth);
          if (closingBraceCol !== null) {
            captureData.push({
              line: lineNum,
              column: closingBraceCol,
              text: "}",
              type: "}",
              indent: colons[0].indent,
              parentType: "inline_object",
              scopeId: depthScopeId,
            });
          }
        }
      }

      // Also emit } tokens for NESTED objects on inline object lines
      // These are objects like { auth: false } that may only have 1 colon
      // but should still have their } aligned across lines
      for (const key of inlineObjectLineDepths) {
        const [lineStr, depthStr] = key.split(":");
        const lineNum = parseInt(lineStr);
        const depth = parseInt(depthStr);
        
        // Only process depth 1 (outer objects) - we'll find nested } from there
        if (depth !== 1) continue;
        
        const lineText = document.lineAt(lineNum).text;
        const outerColons = colonsByLineAndDepth.get(key);
        if (!outerColons) continue;
        
        // Find all nested objects on this line by looking for { } pairs at depth 2
        const nestedBraces = this.findNestedObjectBraces(lineText, outerColons);
        
        for (const nestedBrace of nestedBraces) {
          captureData.push({
            line: lineNum,
            column: nestedBrace.insertCol,
            text: "}",
            type: "}",
            indent: outerColons[0].indent,
            parentType: "inline_object_nested",
            scopeId: `${outerColons[0].scopeId}_nested_${nestedBrace.depth}`,
          });
        }
      }

      // For inline objects with } alignment, handle colons specially:
      // - Depth 1 (outer object): first colon aligns, OTHER colons get NO padding (skip them)
      // - Depth 2+ (nested objects): ALL colons get NO padding (only } aligns)
      // 
      // Mark ALL colons at depth 2+ as nested, AND non-first colons at depth 1
      // This prevents secondary colons from interfering with alignment
      for (const data of captureData) {
        if (data.type !== ":") continue;
        const lineText = document.lineAt(data.line).text;
        const depth = this.getBraceDepthAtColumn(lineText, data.column);
        
        if (depth >= 2) {
          // ALL colons at depth 2+ are nested - mark them to skip alignment
          data.parentType = "inline_object_nested_colon";
          data.scopeId = `${data.scopeId}_depth${depth}_no_align`;
          continue;
        }
        
        // Depth 1: check if this line has inline objects
        const key = `${data.line}:${depth}`;
        if (!inlineObjectLineDepths.has(key)) continue;
        
        // Outer object: first colon aligns, others get NO padding (skip them)
        const depthColons = colonsByLineAndDepth.get(key);
        if (!depthColons) continue;
        const minColonCol = Math.min(...depthColons.map((c) => c.column));
        if (data.column !== minColonCol) {
          // Mark non-first colons to be skipped (no alignment, no min spacing)
          data.parentType = "inline_object_secondary_colon";
          data.scopeId = `${data.scopeId}_depth${depth}_no_align`;
        }
      }

      // Find function calls and add argument comma tokens
      // Collect function call data from captures
      interface FuncCallData {
        line: number;
        funcName: string;
        argsText: string;
        argsStartCol: number;
        indent: number;
      }
      const funcCalls: FuncCallData[] = [];

      // Group captures by their parent call_expression node ID
      const callCaptures = new Map<
        number,
        { funcName?: string; argsNode?: TreeNode; callNode?: TreeNode }
      >();
      for (const capture of captures) {
        if (
          capture.name === "func_name" ||
          capture.name === "func_args" ||
          capture.name === "func_call"
        ) {
          // Find the call_expression ancestor
          let callNode = capture.node;
          while (callNode && callNode.type !== "call_expression") {
            callNode = callNode.parent!;
          }
          if (!callNode) continue;

          const callId = callNode.id;
          if (!callCaptures.has(callId)) {
            callCaptures.set(callId, {});
          }
          const data = callCaptures.get(callId)!;

          if (capture.name === "func_name") {
            data.funcName = capture.node.text;
          } else if (capture.name === "func_args") {
            data.argsNode = capture.node;
          } else if (capture.name === "func_call") {
            data.callNode = capture.node;
          }
        }
      }

      // Process collected function calls
      for (const [, data] of callCaptures) {
        if (!data.funcName || !data.argsNode || !data.callNode) continue;

        const line = data.callNode.startPosition.row;
        if (line < startLine || line > endLine) continue;

        const lineText = document.lineAt(line).text;
        const indent = getIndentLevel(lineText);

        funcCalls.push({
          line,
          funcName: data.funcName,
          argsText: data.argsNode.text,
          argsStartCol: data.argsNode.startPosition.column,
          indent,
        });
      }

      // Group consecutive function calls by (funcName, indent)
      // Extract:
      // 1. NUMERIC argument values for right-alignment (funcArg)
      // 2. Commas for left-alignment of non-numeric arguments
      funcCalls.sort((a, b) => a.line - b.line);

      for (const call of funcCalls) {
        // Extract argument values (start position and text)
        const argsContent = call.argsText;
        const args = this.extractFunctionArguments(argsContent);

        // Find comma positions between arguments
        const commaPositions = this.findFunctionArgumentCommas(argsContent);

        // Use function name + indent as scope
        // This allows consecutive calls to the same function to align
        const scopeId = `func_${call.funcName}_${call.indent}`;

        // Track which argument positions have numeric values (for funcArg)
        const numericArgIndices = new Set<number>();

        for (let i = 0; i < args.length; i++) {
          const arg = args[i];

          // Only emit funcArg tokens for NUMERIC arguments
          // Numbers look good right-aligned, strings don't
          if (this.isNumericLiteral(arg.text)) {
            numericArgIndices.add(i);

            // Convert relative column (within args) to absolute column
            const absoluteCol = call.argsStartCol + arg.startCol;

            captureData.push({
              line: call.line,
              column: absoluteCol,
              text: arg.text,
              type: "funcArg",
              indent: call.indent,
              parentType: "function_arguments",
              scopeId,
            });
          }
        }

        // Add comma tokens for left-alignment
        // Skip commas that precede numeric arguments (those use funcArg right-alignment)
        for (let i = 0; i < commaPositions.length; i++) {
          const commaCol = commaPositions[i];
          const nextArgIndex = i + 1; // Comma i separates arg i from arg i+1

          // If the NEXT argument is numeric, skip this comma
          // (funcArg will handle alignment for that position)
          if (numericArgIndices.has(nextArgIndex)) {
            continue;
          }

          const absoluteCol = call.argsStartCol + commaCol;

          captureData.push({
            line: call.line,
            column: absoluteCol,
            text: ",",
            type: ",",
            indent: call.indent,
            parentType: "function_arguments",
            scopeId,
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
      const indent = getIndentLevel(lineText);

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
      const indent = getIndentLevel(lineText);

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
        const indent = getIndentLevel(lineText);
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
        const indent = getIndentLevel(lineText);

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

          if (isInsideStringOrComment(node)) {
            continue;
          }

          const operatorText = node.text;
          const operatorType = normalizeOperator(operatorText);

          if (!operatorType) {
            continue;
          }

          const lineText = lines[blockLine] || "";
          const indent = getIndentLevel(lineText);

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

          const parentType = getParentType(node);

          // Combine block scope with AST scope for fine-grained grouping
          const astScopeId = getScopeId(node);
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
   * Checks if a string is a numeric literal.
   * Matches integers, decimals, negative numbers, hex, binary, octal, etc.
   */
  private isNumericLiteral(text: string): boolean {
    // Integer: 42, -42
    // Decimal: 3.14, -3.14, .5
    // Hex: 0x1A, 0X1a
    // Binary: 0b101
    // Octal: 0o17
    // Scientific: 1e10, 1.5e-3
    // Underscore separators: 1_000_000
    const numericPattern =
      /^-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)$/;
    return numericPattern.test(text);
  }

  /**
   * Finds commas between function arguments.
   * The input is the text of the arguments node (including parentheses).
   * Returns relative column positions of commas within the args text.
   */
  private findFunctionArgumentCommas(argsText: string): number[] {
    const commaPositions: number[] = [];
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0;

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];

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

      if (char === "(" || char === "{" || char === "[") {
        depth++;
        continue;
      }
      if (char === ")" || char === "}" || char === "]") {
        depth--;
        continue;
      }

      // Found a comma at depth 1 (inside the outermost parens)
      if (char === "," && depth === 1) {
        commaPositions.push(i);
      }
    }

    return commaPositions;
  }

  /**
   * Extracts function argument values with their positions.
   * The input is the text of the arguments node (including parentheses).
   * Returns array of {startCol, text} for each argument.
   */
  private extractFunctionArguments(
    argsText: string,
  ): Array<{ startCol: number; text: string }> {
    const args: Array<{ startCol: number; text: string }> = [];
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0;

    let argStart = -1; // Start of current argument
    let argContent = ""; // Content of current argument

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];

      if (escaped) {
        escaped = false;
        if (depth === 1 && argStart !== -1) {
          argContent += char;
        }
        continue;
      }

      if (char === "\\" && inString) {
        escaped = true;
        if (depth === 1 && argStart !== -1) {
          argContent += char;
        }
        continue;
      }

      if ((char === '"' || char === "'" || char === "`") && !inString) {
        inString = true;
        stringChar = char;
        if (depth === 1) {
          if (argStart === -1) {
            argStart = i;
          }
          argContent += char;
        }
        continue;
      }

      if (char === stringChar && inString) {
        inString = false;
        stringChar = "";
        if (depth === 1 && argStart !== -1) {
          argContent += char;
        }
        continue;
      }

      if (inString) {
        if (depth === 1 && argStart !== -1) {
          argContent += char;
        }
        continue;
      }

      // Track nesting
      if (char === "(") {
        depth++;
        if (depth > 1 && argStart !== -1) {
          argContent += char;
        }
        continue;
      }
      if (char === "{" || char === "[") {
        if (depth === 1 && argStart === -1) {
          argStart = i;
        }
        depth++;
        if (argStart !== -1) {
          argContent += char;
        }
        continue;
      }
      if (char === ")" || char === "}" || char === "]") {
        if (char === ")" && depth === 1) {
          // End of arguments - finalize last arg
          if (argStart !== -1) {
            const trimmedContent = argContent.trim();
            if (trimmedContent.length > 0) {
              // Find the actual start (skip leading whitespace)
              const leadingWs =
                argContent.length - argContent.trimStart().length;
              args.push({
                startCol: argStart + leadingWs,
                text: trimmedContent,
              });
            }
          }
        } else if (argStart !== -1) {
          argContent += char;
        }
        depth--;
        continue;
      }

      // At depth 1: we're inside the function's argument list
      if (depth === 1) {
        if (char === ",") {
          // End of current argument
          if (argStart !== -1) {
            const trimmedContent = argContent.trim();
            if (trimmedContent.length > 0) {
              const leadingWs =
                argContent.length - argContent.trimStart().length;
              args.push({
                startCol: argStart + leadingWs,
                text: trimmedContent,
              });
            }
          }
          argStart = -1;
          argContent = "";
        } else if (char !== " " && char !== "\t" && argStart === -1) {
          // Start of a new argument (first non-whitespace)
          argStart = i;
          argContent = char;
        } else if (argStart !== -1) {
          argContent += char;
        }
      }
    }

    return args;
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
   * Calculates the brace depth at a given column in a line.
   * Returns 0 if outside all braces, 1 if inside first brace, 2+ if nested.
   * Handles strings properly.
   */
  private getBraceDepthAtColumn(lineText: string, targetColumn: number): number {
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;

    for (let i = 0; i < targetColumn && i < lineText.length; i++) {
      const char = lineText[i];

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

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      }
    }

    return depth;
  }

  /**
   * Finds the closing brace position for a specific depth level.
   * Returns the column RIGHT AFTER the last value, before any trailing whitespace/}.
   * This allows padding to be inserted between the value and the closing brace.
   *
   * @param lineText - The full line text
   * @param colons - Colons at this depth level
   * @param targetDepth - The depth level (1 = outermost, 2 = first nested, etc.)
   */
  private findClosingBraceAtDepth(
    lineText: string,
    colons: { column: number }[],
    targetDepth: number,
  ): number | null {
    // Find the rightmost colon at this depth
    const rightmostColonCol = Math.max(...colons.map((c) => c.column));

    // Find the } that closes this depth level
    // Start from rightmost colon and track depth relative to our target
    let closingBraceCol = -1;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let currentDepth = targetDepth; // We're at targetDepth at the colon position

    for (let i = rightmostColonCol + 1; i < lineText.length; i++) {
      const char = lineText[i];

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

      if (char === "{") {
        currentDepth++;
        continue;
      }

      if (char === "}") {
        currentDepth--;
        if (currentDepth === targetDepth - 1) {
          // This } closes our target depth level
          closingBraceCol = i;
          break;
        }
      }
    }

    if (closingBraceCol === -1) {
      return null;
    }

    // Now find the last non-whitespace character before the }
    // We want to insert padding AFTER that character
    let lastNonWhitespace = closingBraceCol - 1;
    while (lastNonWhitespace > rightmostColonCol && /\s/.test(lineText[lastNonWhitespace])) {
      lastNonWhitespace--;
    }

    // Return the position AFTER the last non-whitespace character
    // This is where padding should be inserted
    return lastNonWhitespace + 1;
  }

  /**
   * Legacy wrapper for findClosingBraceAtDepth at depth 1.
   */
  private findInlineObjectClosingBrace(
    lineText: string,
    colons: { column: number }[],
  ): number | null {
    return this.findClosingBraceAtDepth(lineText, colons, 1);
  }

  /**
   * Finds all nested object closing braces on a line.
   * Returns insertion positions (after last value, before the nested }).
   */
  private findNestedObjectBraces(
    lineText: string,
    outerColons: { column: number }[],
  ): Array<{ insertCol: number; depth: number }> {
    const results: Array<{ insertCol: number; depth: number }> = [];
    
    // Scan the line for nested objects (depth 2+)
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0;
    let nestedStart = -1; // Column where current nested object started
    let lastNonWhitespace = -1;
    
    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      
      if (escaped) {
        escaped = false;
        if (depth >= 2 && !inString) {
          lastNonWhitespace = i;
        }
        continue;
      }
      
      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }
      
      if ((char === '"' || char === "'" || char === "`") && !inString) {
        inString = true;
        stringChar = char;
        if (depth >= 2) {
          lastNonWhitespace = i;
        }
        continue;
      }
      
      if (char === stringChar && inString) {
        inString = false;
        stringChar = "";
        if (depth >= 2) {
          lastNonWhitespace = i;
        }
        continue;
      }
      
      if (inString) {
        if (depth >= 2) {
          lastNonWhitespace = i;
        }
        continue;
      }
      
      if (char === "{") {
        depth++;
        if (depth === 2) {
          nestedStart = i;
          lastNonWhitespace = -1; // Reset for this nested object
        }
        continue;
      }
      
      if (char === "}") {
        if (depth === 2 && nestedStart !== -1) {
          // Found the end of a nested object
          // insertCol should be right BEFORE the } for padding
          // This gives "value ·}" instead of "value· }"
          results.push({
            insertCol: i,
            depth: 2,
          });
          nestedStart = -1;
        }
        depth--;
        continue;
      }
      
      // Track last non-whitespace inside nested objects
      if (depth >= 2 && !/\s/.test(char)) {
        lastNonWhitespace = i;
      }
    }
    
    return results;
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
