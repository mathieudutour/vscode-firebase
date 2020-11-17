import { TextDecoder } from 'util'
import * as vscode from 'vscode'
import { configStore } from './config-store'

const { fs } = vscode.workspace

const memory: Map<string, vscode.Uri> = new Map()

async function exists(path: vscode.Uri) {
  try {
    await fs.readFile(path)
    return true
  } catch (err) {
    return false
  }
}

async function detectProjectRoot(cwd: vscode.Uri) {
  const existingRoot = memory.get(cwd.path)
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

export async function detectProjectRootForFile(filePath: vscode.Uri) {
  const cwd = vscode.Uri.joinPath(filePath, '../')

  const projectRoot = await detectProjectRoot(cwd)

  if (!projectRoot) {
    return undefined
  }

  memory.set(cwd.path, projectRoot)

  return projectRoot
}

export async function detectProjectNameForFile(filePath: vscode.Uri) {
  const projectRoot = await detectProjectRootForFile(filePath)

  if (!projectRoot) {
    return undefined
  }

  const activeProjects = configStore.get('activeProjects') || {}

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
