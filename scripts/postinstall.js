#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')

const packageRoot = path.join(__dirname, '..')
const packageJson = path.join(packageRoot, 'package.json')

if (!fs.existsSync(packageJson)) {
  process.exit(0)
}

let pkg
try {
  pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
} catch (error) {
  process.exit(0)
}

if (!pkg || pkg.name !== 'unmapx') {
  process.exit(0)
}

const MIN_NODE_VERSION = 18
const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10)

if (nodeVersion < MIN_NODE_VERSION) {
  console.warn(`Warning: Node.js version ${process.version} may not be fully supported.`)
  console.warn(`This package recommends Node.js >= ${MIN_NODE_VERSION}.0.0`)
}

const binPath = path.join(packageRoot, 'bin', 'unmapx')

if (!fs.existsSync(binPath)) {
  process.exit(0)
}

try {
  if (os.platform() !== 'win32') {
    const stats = fs.statSync(binPath)
    if ((stats.mode & 0o111) === 0) {
      fs.chmodSync(binPath, 0o755)
    }
  }
} catch (error) {
}

const nodeModulesDir = path.join(packageRoot, 'node_modules')
const isDevelopmentInstall = fs.existsSync(nodeModulesDir) && 
  fs.existsSync(path.join(nodeModulesDir, pkg.name)) === false

if (!isDevelopmentInstall) {
  process.exit(0)
}

const nodeModulesBin = path.join(nodeModulesDir, '.bin')
const binTarget = path.join(nodeModulesBin, 'unmapx')

try {
  if (!fs.existsSync(nodeModulesBin)) {
    fs.mkdirSync(nodeModulesBin, { recursive: true })
  }

  if (fs.existsSync(binTarget)) {
    try {
      fs.readlinkSync(binTarget)
      process.exit(0)
    } catch (err) {
      try {
        fs.unlinkSync(binTarget)
      } catch (e) {
      }
    }
  }

  const relativePath = path.relative(nodeModulesBin, binPath)

  if (os.platform() === 'win32') {
    const wrapper = `@IF EXIST "%~dp0\\..\\unmapx\\bin\\unmapx" (
  "%~dp0\\..\\unmapx\\bin\\unmapx" %*
) ELSE (
  node "%~dp0\\..\\unmapx\\bin\\unmapx" %*
)`
    try {
      fs.writeFileSync(binTarget + '.cmd', wrapper)
      fs.writeFileSync(binTarget + '.ps1', `& node "${binPath.replace(/\\/g, '/')}" $args`)
    } catch (error) {
    }
  } else {
    try {
      fs.symlinkSync(relativePath, binTarget, 'file')
      try {
        fs.chmodSync(binTarget, 0o755)
      } catch (e) {
      }
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          fs.unlinkSync(binTarget)
          fs.symlinkSync(relativePath, binTarget, 'file')
          try {
            fs.chmodSync(binTarget, 0o755)
          } catch (e) {
          }
        } catch (e) {
          try {
            fs.copyFileSync(binPath, binTarget)
            fs.chmodSync(binTarget, 0o755)
          } catch (copyErr) {
          }
        }
      } else {
        try {
          fs.copyFileSync(binPath, binTarget)
          fs.chmodSync(binTarget, 0o755)
        } catch (copyErr) {
        }
      }
    }
  }
} catch (error) {
}
