/**
 * Type definitions for Tree-sitter WASM interfaces.
 *
 * These interfaces match @vscode/tree-sitter-wasm API shapes.
 */

export interface Point {
  row: number;
  column: number;
}

export interface TreeNode {
  id: number;
  type: string;
  text: string;
  startPosition: Point;
  parent: TreeNode | null;
}

export interface Tree {
  rootNode: TreeNode;
  delete(): void;
}

export interface QueryCapture {
  name: string;
  node: TreeNode;
}

export interface Query {
  captures(node: TreeNode): QueryCapture[];
  delete(): void;
}

export interface Language {
  query(source: string): Query;
}

export interface Parser {
  setLanguage(language: Language): void;
  parse(text: string): Tree | null;
  delete(): void;
}

export interface ParserClass {
  init(options?: {
    locateFile: (file: string, folder: string) => string;
  }): Promise<void>;
  new (): Parser;
}

export interface LanguageClass {
  load(path: string): Promise<Language>;
}
