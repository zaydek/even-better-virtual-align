/**
 * Adapter that wraps VS Code TextDocument to implement ParseableDocument.
 * Used in the extension runtime to connect VS Code documents to ParserService.
 */

import * as vscode from "vscode";
import { ParseableDocument } from "../core/types";

export class VSCodeDocumentAdapter implements ParseableDocument {
  constructor(private readonly document: vscode.TextDocument) {}

  get languageId(): string {
    return this.document.languageId;
  }

  get lineCount(): number {
    return this.document.lineCount;
  }

  getText(): string {
    return this.document.getText();
  }

  /**
   * Get text for a specific line.
   * Convenience method for line-by-line parsing.
   */
  lineAt(line: number): { text: string } {
    return { text: this.document.lineAt(line).text };
  }
}
