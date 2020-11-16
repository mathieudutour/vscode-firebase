import { TextDecoder } from 'util'
import * as vscode from 'vscode'
import { configStore } from './config-store'

const memory: Map<vscode.Uri, vscode.Uri> = new Map()

async function exists(path: vscode.Uri) {
  const { fs } = vscode.workspace

  try {
    await fs.readFile(path)
    return true
  } catch (err) {
    return false
  }
}

async function detectProjectRoot(cwd: vscode.Uri) {
  const existingRoot = memory.get(cwd)
  if (existingRoot && (await exists(existingRoot))) {
    return existingRoot
  }

  let projectRootDir = cwd
  while (
    !(await exists(vscode.Uri.joinPath(projectRootDir, './firebase.json')))
  ) {
    const parentDir = vscode.Uri.joinPath(projectRootDir, '../')
    if (parentDir === projectRootDir) {
      return null
    }
    projectRootDir = parentDir
  }
  return projectRootDir
}

export async function detectProjectForFile(filePath: vscode.Uri) {
  const { fs } = vscode.workspace
  const activeProjects = configStore.get('activeProjects') || {}

  const cwd = vscode.Uri.joinPath(filePath, '../')

  const projectRoot = await detectProjectRoot(cwd)

  if (!projectRoot) {
    return undefined
  }

  memory.set(cwd, projectRoot)

  let projectName =
    activeProjects[projectRoot.path] ||
    activeProjects[projectRoot.path.replace(/\/$/, '')]

  // handle project aliases
  if (projectName) {
    const firebasercPath = vscode.Uri.joinPath(projectRoot, '.firebaserc')
    try {
      const firebasercContent = await fs.readFile(firebasercPath)
      const firebaserc = JSON.parse(
        new TextDecoder('utf-8').decode(firebasercContent)
      )
      if (firebaserc.projects[projectName]) {
        projectName = firebaserc.projects[projectName]
      }
    } catch (err) {}
  }

  return projectName
}
