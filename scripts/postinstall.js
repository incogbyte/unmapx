#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')

const packageRoot = path.join(__dirname, '..')
const binPath = path.join(packageRoot, 'bin', 'unmapx')


try {
  if (fs.existsSync(binPath)) {
    
    if (os.platform() !== 'win32') {
      const stats = fs.statSync(binPath)
      
      if ((stats.mode & 0o111) === 0) {
        fs.chmodSync(binPath, 0o755)
      }
    }
  }
} catch (error) {
 
}


const nodeModulesBin = path.join(packageRoot, 'node_modules', '.bin')
const binTarget = path.join(nodeModulesBin, 'unmapx')

try {

  const packageJson = path.join(packageRoot, 'package.json')
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
    
    if (pkg.name === 'unmapx') {
      
      if (!fs.existsSync(nodeModulesBin)) {
        fs.mkdirSync(nodeModulesBin, { recursive: true })
      }

     
      if (!fs.existsSync(binTarget) && fs.existsSync(binPath)) {
        const relativePath = path.relative(nodeModulesBin, binPath)
        
       
        if (os.platform() === 'win32') {
          
          const wrapper = `@IF EXIST "%~dp0\\..\\unmapx\\bin\\unmapx" (
  "%~dp0\\..\\unmapx\\bin\\unmapx" %*
) ELSE (
  node "%~dp0\\..\\unmapx\\bin\\unmapx" %*
)`
          fs.writeFileSync(binTarget + '.cmd', wrapper)
          fs.writeFileSync(binTarget + '.ps1', 
            `& node "${binPath.replace(/\\/g, '/')}" $args`)
        } else {
         
          try {
            fs.symlinkSync(relativePath, binTarget)
          } catch (err) {
            
            if (err.code === 'EEXIST') {
              try {
                fs.unlinkSync(binTarget)
                fs.symlinkSync(relativePath, binTarget)
              } catch (e) {
                
              }
            }
          }
        }
      }
    }
  }
} catch (error) {
  
}

