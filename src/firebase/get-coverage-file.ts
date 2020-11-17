import { TextDecoder } from 'util'
import * as vscode from 'vscode'
import { detectProjectRootForFile } from './detect-project'

const { fs } = vscode.workspace

const memory: Map<string, ResolvedReport[]> = new Map()
const watchers: vscode.FileSystemWatcher[] = []

export type Value = {
  // error
  undefined?: {
    causeMessage: string
  }

  // simple
  nullValue?: any
  boolValue?: any
  intValue?: any
  floatValue?: any
  stringValue?: any
  bytesValue?: any
  durationValue?: any
  timestampValue?: any
  latlngValue?: any
  pathValue?: any

  // complex
  mapValue?: any
  listValue?: any
  constraintValue?: any
}

type Report = {
  sourcePosition: {
    line: number
    column: number
    currentOffset: number
    endOffset: number
  }
  values: {
    value: Value
    count: number
  }[]
  children?: Report[]
}

type ResolvedReport = {
  range: vscode.Range
  values: {
    value: Value
    count: number
  }[]
}

function flattenReport(report: Report[]) {
  const res: ResolvedReport[] = []

  report.forEach((r) => {
    const start = new vscode.Position(
      r.sourcePosition.line - 1,
      r.sourcePosition.column - 1
    )

    res.push({
      range: new vscode.Range(
        start,
        start.translate(
          undefined,
          r.sourcePosition.endOffset - r.sourcePosition.currentOffset + 2
        )
      ),
      values: r.values,
    })
    if (r.children) {
      res.push(...flattenReport(r.children))
    }
  })

  return res
}

export async function getCoverageFile(doc: vscode.Uri, coveragePath?: string) {
  if (!coveragePath) {
    return undefined
  }

  const projectRoot = await detectProjectRootForFile(doc)

  if (!projectRoot) {
    return undefined
  }

  try {
    const resolvedCoveragePath = vscode.Uri.joinPath(projectRoot, coveragePath)

    const existing = memory.get(resolvedCoveragePath.path)

    if (existing) {
      return existing
    }

    const coveragePathContent = await fs.readFile(resolvedCoveragePath)

    const coverage = new TextDecoder('utf-8').decode(coveragePathContent)
    const coverageData = JSON.parse(
      coverage
        .split('// Populated by the emulator at runtime\nconst data = ')[1]
        .split(';\n\nconst REPORT_LIMIT_SIZE')[0]
    ) as { rules: { files: { name: string }[] }; report: Report[] }

    if (coverageData.rules.files[0].name !== doc.path) {
      console.error('report for the wrong file')
      return undefined
    }

    const watcher = vscode.workspace.createFileSystemWatcher(
      resolvedCoveragePath.path
    )
    watcher.onDidChange((e) => {
      console.log(e.path)
      memory.delete(e.path)
    })
    watcher.onDidDelete((e) => {
      memory.delete(e.path)
    })
    watcher.onDidCreate((e) => {
      memory.delete(e.path)
    })
    watchers.push(watcher)

    const report = flattenReport(coverageData.report)
    memory.set(resolvedCoveragePath.path, report)

    return report
  } catch (err) {
    console.error('cannot find coverage file')
  }
}
