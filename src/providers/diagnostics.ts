import * as vscode from 'vscode'
import path from 'path'
import api from '../firebase/api'
import { configStore } from '../firebase/config-store'
import { detectProject } from '../firebase/detect-project'

const API_VERSION = 'v1'

export const registerDiagnosticsProvider = (
  selector: vscode.DocumentSelector,
  diagnosticProvider: DiagnosticProvider
) => {
  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.languageId === selector
  ) {
    diagnosticProvider.refreshDiagnostics(
      vscode.window.activeTextEditor.document
    )
  }

  return vscode.Disposable.from(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === selector) {
        diagnosticProvider.refreshDiagnostics(editor.document)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((editor) => {
      if (editor.document.languageId === selector) {
        diagnosticProvider.refreshDiagnostics(editor.document)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === selector) {
        diagnosticProvider.deleteDiagnostics(document)
      }
    })
  )
}

export class DiagnosticProvider {
  firebaseDiagnostics: vscode.DiagnosticCollection
  refreshToken: string | undefined
  currentRefresh: number | null = null

  hadNotifiedForMissingProject: { [uri: string]: boolean } = {}

  public constructor() {
    this.firebaseDiagnostics = vscode.languages.createDiagnosticCollection(
      'firebase'
    )

    const tokens = configStore.get('tokens')
    const user = configStore.get('user')

    if (!user || !tokens) {
      vscode.window.showErrorMessage(
        `Failed to authenticate, have you run "npx firebase login"?`
      )
    }

    this.refreshToken = tokens.refresh_token
    if (this.refreshToken) {
      api.setRefreshToken(this.refreshToken)
    }
  }

  /**
   * Analyzes the text document for problems.
   * @param doc text document to analyze
   */
  public async refreshDiagnostics(doc: vscode.TextDocument) {
    if (!this.refreshToken) {
      // we need the refresh token to call the API
      return
    }

    const project = detectProject(path.dirname(doc.uri.path))

    if (!project) {
      if (!this.hadNotifiedForMissingProject[doc.uri.path]) {
        this.hadNotifiedForMissingProject[doc.uri.path] = true
        vscode.window.showErrorMessage(
          `Failed to find firebase project, have you run "npx firebase use"?`
        )
      }
      return
    }

    const currentRefresh = Math.random()
    this.currentRefresh = currentRefresh

    const files = [{ name: doc.uri.path, content: doc.getText() }]

    try {
      const res = await api.request(
        'POST',
        `/${API_VERSION}/projects/${encodeURIComponent(project)}:test`,
        {
          origin: api.rulesOrigin,
          data: {
            source: { files },
          },
          auth: true,
        }
      )

      if (this.currentRefresh !== currentRefresh) {
        // we started another refresh so don't override it (as it's more recent)
        return
      }

      if (!res.body.issues || !res.body.issues.length) {
        this.currentRefresh = null
        return this.deleteDiagnostics(doc)
      }

      const diagnostics: vscode.Diagnostic[] = (res.body.issues || []).map(
        this.createDiagnostic
      )
      this.firebaseDiagnostics.set(doc.uri, diagnostics)
    } catch (err) {
      console.error(err)
    }

    this.currentRefresh = null
  }

  public deleteDiagnostics(doc: vscode.TextDocument) {
    this.firebaseDiagnostics.delete(doc.uri)
  }

  private createDiagnostic(issue: {
    description: string
    severity: 'WARNING' | 'ERROR'
    sourcePosition: {
      column: number
      currentOffset: number
      endOffset: number
      fileName: string
      line: number
    }
  }): vscode.Diagnostic {
    // create range that represents, where in the document the word is
    const range = new vscode.Range(
      issue.sourcePosition.line - 1,
      issue.sourcePosition.column - 1,
      issue.sourcePosition.line - 1,
      issue.sourcePosition.column +
        (issue.sourcePosition.endOffset - issue.sourcePosition.currentOffset)
    )

    const diagnostic = new vscode.Diagnostic(
      range,
      issue.description,
      issue.severity === 'ERROR'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning
    )
    // diagnostic.code = EMOJI_MENTION
    return diagnostic
  }
}
