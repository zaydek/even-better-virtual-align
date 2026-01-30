/**
 * Even Better Virtual Align - Virtual code alignment for TypeScript, JSON, and Python.
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
    statusBarItem.tooltip = "Even Better Virtual Align: Enabled (click to disable)";
  } else {
    statusBarItem.text = "$(x) Align";
    statusBarItem.tooltip = "Even Better Virtual Align: Disabled (click to enable)";
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
  outputChannel = vscode.window.createOutputChannel("Even Better Virtual Align");
  context.subscriptions.push(outputChannel);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "even-better-virtual-align.toggle";
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
      `Even Better Virtual Align: Failed to initialize. Error: ${errorMsg}`,
    );
    return;
  }

  // Create debounced update function
  const debouncedUpdate = debounce(updateEditor, DEBOUNCE_MS);

  // Register toggle command
  const toggleCommand = vscode.commands.registerCommand(
    "even-better-virtual-align.toggle",
    () => {
      enabled = !enabled;
      updateStatusBar();
      log(`Toggled: ${enabled ? "enabled" : "disabled"}`);
      if (enabled) {
        vscode.window.showInformationMessage("Even Better Virtual Align: Enabled");
        if (vscode.window.activeTextEditor) {
          debouncedUpdate(vscode.window.activeTextEditor);
        }
      } else {
        vscode.window.showInformationMessage("Even Better Virtual Align: Disabled");
        decorationManager.clearAll();
      }
    },
  );
  context.subscriptions.push(toggleCommand);

  // Register enable command
  const enableCommand = vscode.commands.registerCommand(
    "even-better-virtual-align.enable",
    () => {
      if (!enabled) {
        enabled = true;
        updateStatusBar();
        log("Enabled");
        vscode.window.showInformationMessage("Even Better Virtual Align: Enabled");
        if (vscode.window.activeTextEditor) {
          debouncedUpdate(vscode.window.activeTextEditor);
        }
      }
    },
  );
  context.subscriptions.push(enableCommand);

  // Register disable command
  const disableCommand = vscode.commands.registerCommand(
    "even-better-virtual-align.disable",
    () => {
      if (enabled) {
        enabled = false;
        updateStatusBar();
        log("Disabled");
        vscode.window.showInformationMessage("Even Better Virtual Align: Disabled");
        decorationManager.clearAll();
      }
    },
  );
  context.subscriptions.push(disableCommand);

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
  const langId = document.languageId;

  // Check if language is supported
  if (!isSupportedLanguage(langId)) {
    decorationManager.clear(editor);
    return;
  }

  // Check if language is enabled in settings
  const config = vscode.workspace.getConfiguration("evenBetterVirtualAlign");
  const enabledLanguages = config.get<Record<string, boolean>>("enabledLanguages", {});
  if (enabledLanguages[langId] === false) {
    decorationManager.clear(editor);
    return;
  }

  // Process entire file
  const startLine = 0;
  const endLine = document.lineCount - 1;

  try {
    // Parse document to extract tokens
    const tokens = await parserService.parse(document, startLine, endLine);

    // Group tokens into alignment groups
    const groups = groupTokens(tokens);

    // Update decorations
    decorationManager.update(editor, groups);
  } catch (error) {
    log(
      `Update failed: ${error instanceof Error ? error.message : String(error)}`,
    );
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
