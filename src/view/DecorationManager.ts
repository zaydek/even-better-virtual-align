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
   *
   * Two-pass algorithm to handle accumulated shift:
   * 1. First pass: Calculate padding for non-comment operators, track per-line shift
   * 2. Second pass: Calculate comment padding accounting for accumulated shift
   */
  update(editor: vscode.TextEditor, groups: AlignmentGroup[]): void {
    // Clear existing decorations for this editor
    this.clear(editor);

    // Separate comment groups from regular groups
    const commentGroups = groups.filter((g) => g.tokens[0]?.type === "//");
    const regularGroups = groups.filter((g) => g.tokens[0]?.type !== "//");

    // Track accumulated "padAfter" shift per line
    // This is the total visual shift caused by padding inserted AFTER operators
    const lineShift = new Map<number, number>();

    // Batch ranges by width for efficient decoration application
    const rangesByWidth = new Map<number, vscode.Range[]>();

    // --- PASS 1: Process regular operators ---
    for (const group of regularGroups) {
      for (const token of group.tokens) {
        let spacesNeeded: number;
        let pos: vscode.Position;

        if (group.padAfter) {
          // For `:` - pad AFTER operator to align values
          const operatorEndColumn = token.column + token.text.length;
          spacesNeeded = group.targetColumn - operatorEndColumn;
          pos = new vscode.Position(token.line, operatorEndColumn);

          // Track this shift for comment alignment
          if (spacesNeeded > 0) {
            const currentShift = lineShift.get(token.line) ?? 0;
            lineShift.set(token.line, currentShift + spacesNeeded);
          }
        } else {
          // For `=`, `&&`, `||` - pad BEFORE operator to align operators
          spacesNeeded = group.targetColumn - token.column;
          pos = new vscode.Position(token.line, token.column);
        }

        if (spacesNeeded <= 0 || spacesNeeded > MAX_CACHED_WIDTH) {
          continue;
        }

        if (!rangesByWidth.has(spacesNeeded)) {
          rangesByWidth.set(spacesNeeded, []);
        }

        rangesByWidth.get(spacesNeeded)!.push(new vscode.Range(pos, pos));
      }
    }

    // --- PASS 2: Process comment groups with shift adjustment ---
    for (const group of commentGroups) {
      // Recalculate target column using VISUAL positions
      // Visual position = original column + accumulated shift
      const visualColumns = group.tokens.map((t) => {
        const shift = lineShift.get(t.line) ?? 0;
        return t.column + shift;
      });
      const targetVisualColumn = Math.max(...visualColumns);

      for (const token of group.tokens) {
        const shift = lineShift.get(token.line) ?? 0;
        const currentVisualColumn = token.column + shift;
        const spacesNeeded = targetVisualColumn - currentVisualColumn;

        if (spacesNeeded <= 0 || spacesNeeded > MAX_CACHED_WIDTH) {
          continue;
        }

        const pos = new vscode.Position(token.line, token.column);

        if (!rangesByWidth.has(spacesNeeded)) {
          rangesByWidth.set(spacesNeeded, []);
        }

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
