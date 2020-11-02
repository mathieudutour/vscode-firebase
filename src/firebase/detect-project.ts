import fs from 'fs'
import path from 'path'
import { configStore } from './config-store'

function detectProjectRoot(cwd: string) {
  let projectRootDir = cwd
  while (!fs.existsSync(path.resolve(projectRootDir, './firebase.json'))) {
    const parentDir = path.dirname(projectRootDir)
    if (parentDir === projectRootDir) {
      return null
    }
    projectRootDir = parentDir
  }
  return projectRootDir
}

export function detectProject(cwd: string) {
  const activeProjects = configStore.get('activeProjects') || {}

  const projectRoot = detectProjectRoot(cwd)

  if (!projectRoot) {
    return undefined
  }

  let projectName = activeProjects[projectRoot]

  // handle project aliases
  const firebasercPath = path.join(projectRoot, '.firebaserc')
  if (projectName && fs.readFileSync(firebasercPath)) {
    try {
      const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'))
      if (firebaserc.projects[projectName]) {
        projectName = firebaserc.projects[projectName]
      }
    } catch (err) {}
  }

  return activeProjects[projectRoot]
}
