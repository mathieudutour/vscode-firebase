import * as vscode from 'vscode'
import CompletionProvider from './providers/completion'
import HoverProvider from './providers/hover'
import {
  registerDiagnosticsProvider,
  DiagnosticProvider,
} from './providers/diagnostics'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'firerules',
      new CompletionProvider(),
      '.',
      ' '
    )
  )

  context.subscriptions.push(
    vscode.languages.registerHoverProvider('firerules', new HoverProvider())
  )

  context.subscriptions.push(
    registerDiagnosticsProvider('firerules', new DiagnosticProvider())
  )
}

// this method is called when your extension is deactivated
export function deactivate() {}
