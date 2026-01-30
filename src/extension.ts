/**
 * Alignment Sanity - Virtual code alignment for TypeScript, JSON, and Python.
 *
 * Uses Tree-sitter for reliable parsing and VS Code decorations for
 * visual alignment without modifying files.
 */

import * as vscode from "vscode";
import { isSupportedLanguage } from "./core/types";
import { groupTokens } from "./logic/Grouper";
import { ParserService } from "./parsing/ParserService";
import { debounce } from "./utils/debounce";
import { DecorationManager } from "./view/DecorationManager";

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 100;

/** Number of lines to expand beyond visible range */
const VISIBLE_RANGE_BUFFER = 20;

let parserService: ParserService;
let decorationManager: DecorationManager;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let enabled = true;

/**
 * Updates the status bar item to reflect current state.
 */
function updateStatusBar(): void {
  if (enabled) {
    statusBarItem.text = "$(check) Align";
    statusBarItem.tooltip = "Alignment Sanity: Enabled (click to disable)";
  } else {
    statusBarItem.text = "$(x) Align";
    statusBarItem.tooltip = "Alignment Sanity: Disabled (click to enable)";
  }
}

/**
 * Logs a message to the output channel.
 */
function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

/**
 * Activates the extension.
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel("Alignment Sanity");
  context.subscriptions.push(outputChannel);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "alignment-sanity.toggle";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  log("Activating...");

  // Initialize services
  parserService = new ParserService(context);
  decorationManager = new DecorationManager();

  try {
    await parserService.initialize();
    log("Parser initialized successfully");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Failed to initialize parser: ${errorMsg}`);
    vscode.window.showErrorMessage(
      `Alignment Sanity: Failed to initialize. Error: ${errorMsg}`,
    );
    return;
  }

  // Create debounced update function
  const debouncedUpdate = debounce(updateEditor, DEBOUNCE_MS);

  // Register toggle command
  const toggleCommand = vscode.commands.registerCommand(
    "alignment-sanity.toggle",
    () => {
      enabled = !enabled;
      updateStatusBar();
      log(`Toggled: ${enabled ? "enabled" : "disabled"}`);
      if (enabled) {
        vscode.window.showInformationMessage("Alignment Sanity: Enabled");
        if (vscode.window.activeTextEditor) {
          debouncedUpdate(vscode.window.activeTextEditor);
        }
      } else {
        vscode.window.showInformationMessage("Alignment Sanity: Disabled");
        decorationManager.clearAll();
      }
    },
  );
  context.subscriptions.push(toggleCommand);

  // Listen for active editor changes
  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor && enabled) {
        debouncedUpdate(editor);
      }
    },
  );
  context.subscriptions.push(activeEditorDisposable);

  // Listen for document changes
  const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && enabled && event.document === editor.document) {
        debouncedUpdate(editor);
      }
    },
  );
  context.subscriptions.push(documentChangeDisposable);

  // Listen for visible range changes (scrolling)
  const visibleRangeDisposable =
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (enabled) {
        debouncedUpdate(event.textEditor);
      }
    });
  context.subscriptions.push(visibleRangeDisposable);

  // Initial update for active editor
  if (vscode.window.activeTextEditor) {
    debouncedUpdate(vscode.window.activeTextEditor);
  }

  log("Activated successfully");
}

/**
 * Updates alignment decorations for an editor.
 */
async function updateEditor(editor: vscode.TextEditor): Promise<void> {
  if (!enabled) {
    return;
  }

  const document = editor.document;

  // Check if language is supported
  if (!isSupportedLanguage(document.languageId)) {
    decorationManager.clear(editor);
    return;
  }

  // Get visible range with buffer
  const visibleRanges = editor.visibleRanges;
  if (visibleRanges.length === 0) {
    return;
  }

  const startLine = Math.max(
    0,
    visibleRanges[0].start.line - VISIBLE_RANGE_BUFFER,
  );
  const endLine = Math.min(
    document.lineCount - 1,
    visibleRanges[visibleRanges.length - 1].end.line + VISIBLE_RANGE_BUFFER,
  );

  try {
    // Parse document to extract tokens
    const tokens = await parserService.parse(document, startLine, endLine);

    // Group tokens into alignment groups
    const groups = groupTokens(tokens);

    // Update decorations
    decorationManager.update(editor, groups);
  } catch (error) {
    log(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  if (outputChannel) {
    log("Deactivating...");
  }

  if (decorationManager) {
    decorationManager.dispose();
  }

  if (parserService) {
    parserService.dispose();
  }
}
