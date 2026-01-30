/**
 * Manages VS Code decorations for visual alignment.
 *
 * Key insight from council: VS Code TextEditorDecorationType doesn't support
 * dynamic contentText per range. We work around this by creating a pool of
 * decoration types, one for each unique width (number of spaces).
 */

import * as vscode from "vscode";
import { AlignmentGroup } from "../core/types";

/** Maximum number of spaces we'll cache decoration types for */
const MAX_CACHED_WIDTH = 50;

export class DecorationManager {
  /** Cache of decoration types by width (number of spaces) */
  private decorationTypes: Map<number, vscode.TextEditorDecorationType> =
    new Map();

  /** Track which decoration types are currently applied to clear them */
  private activeDecorations: Map<vscode.TextEditor, Set<number>> = new Map();

  /**
   * Updates decorations for an editor based on alignment groups.
   */
  update(editor: vscode.TextEditor, groups: AlignmentGroup[]): void {
    // Clear existing decorations for this editor
    this.clear(editor);

    // Batch ranges by width for efficient decoration application
    const rangesByWidth = new Map<number, vscode.Range[]>();

    for (const group of groups) {
      for (const token of group.tokens) {
        // Calculate where this operator ends
        const operatorEndColumn = token.column + token.text.length;
        // How many spaces needed to reach the target column (where values align)
        const spacesNeeded = group.targetColumn - operatorEndColumn;

        if (spacesNeeded <= 0 || spacesNeeded > MAX_CACHED_WIDTH) {
          continue;
        }

        if (!rangesByWidth.has(spacesNeeded)) {
          rangesByWidth.set(spacesNeeded, []);
        }

        // Create a zero-width range AFTER the operator
        const pos = new vscode.Position(token.line, operatorEndColumn);
        rangesByWidth.get(spacesNeeded)!.push(new vscode.Range(pos, pos));
      }
    }

    // Apply decorations in batches by width
    const activeWidths = new Set<number>();

    for (const [width, ranges] of rangesByWidth) {
      const decorationType = this.getDecorationType(width);
      editor.setDecorations(decorationType, ranges);
      activeWidths.add(width);
    }

    this.activeDecorations.set(editor, activeWidths);
  }

  /**
   * Gets or creates a decoration type for a specific width.
   */
  private getDecorationType(width: number): vscode.TextEditorDecorationType {
    if (!this.decorationTypes.has(width)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        before: {
          // Use non-breaking spaces for consistent width
          contentText: "\u00a0".repeat(width),
          // Make the spacer invisible but take up space
          color: "transparent",
        },
      });
      this.decorationTypes.set(width, decorationType);
    }
    return this.decorationTypes.get(width)!;
  }

  /**
   * Clears all decorations from an editor.
   */
  clear(editor: vscode.TextEditor): void {
    const activeWidths = this.activeDecorations.get(editor);
    if (activeWidths) {
      for (const width of activeWidths) {
        const decorationType = this.decorationTypes.get(width);
        if (decorationType) {
          editor.setDecorations(decorationType, []);
        }
      }
      this.activeDecorations.delete(editor);
    }
  }

  /**
   * Clears decorations from all editors.
   */
  clearAll(): void {
    for (const editor of this.activeDecorations.keys()) {
      this.clear(editor);
    }
  }

  /**
   * Disposes all decoration types. Call this when deactivating.
   */
  dispose(): void {
    this.clearAll();
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
  }
}
