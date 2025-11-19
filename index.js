const path = require('path')
const fs = require('fs').promises
const https = require('https')
const http = require('http')
const {URL} = require('url')
const {readdir, stat} = require('fs').promises
const os = require('os')

const isWindows = os.platform() === 'win32'
const MAX_FILENAME_LENGTH = 255
const INVALID_CHARS_WIN = /[<>:"|?*\x00-\x1f]/g
const INVALID_CHARS_UNIX = /[\x00\/]/g
const INVALID_CHARS_COMMON = /[<>:"|?*\\]/g
const RESERVED_NAMES_WIN = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i

function sanitizeFilename(filename, options = {}) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed'
  }
  
  let sanitized = filename.trim()
  
  if (isWindows) {
    sanitized = sanitized.replace(INVALID_CHARS_WIN, '_')
    const match = sanitized.match(RESERVED_NAMES_WIN)
    if (match) {
      const name = match[1]
      const ending = match[2] || ''
      sanitized = sanitized.replace(RESERVED_NAMES_WIN, name + '_' + ending)
    }
    sanitized = sanitized.replace(/\.+$/, '')
    if (sanitized.endsWith(' ')) {
      sanitized = sanitized.replace(/ +$/, '')
    }
  } else {
    sanitized = sanitized.replace(INVALID_CHARS_UNIX, '_')
    sanitized = sanitized.replace(INVALID_CHARS_COMMON, '_')
  }
  
  sanitized = sanitized.replace(/[\x80-\x9f]/g, '_')
  
  if (sanitized.length === 0) {
    sanitized = 'unnamed'
  }
  
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(sanitized)
    const nameWithoutExt = path.basename(sanitized, ext)
    const maxNameLength = MAX_FILENAME_LENGTH - ext.length
    sanitized = nameWithoutExt.substring(0, maxNameLength) + ext
  }
  
  return path.normalize(sanitized)
}

function extractInlineSourceMapUrl(sourceCode) {
  const regex = /\/\/[#@]\s*sourceMappingURL=(.+)/i
  const match = sourceCode.match(regex)
  return match ? match[1].trim() : null
}

function decodeBase64SourceMap(dataUri) {
  const base64Match = dataUri.match(/^data:application\/json(?:;charset=[^;]+)?;base64,(.+)$/i)
  if (base64Match) {
    try {
      const base64Data = base64Match[1]
      const jsonString = Buffer.from(base64Data, 'base64').toString('utf8')
      return JSON.parse(jsonString)
    } catch (error) {
      throw new Error(`Failed to decode base64 source map: ${error.message}`)
    }
  }
  
  if (dataUri.startsWith('{')) {
    try {
      return JSON.parse(dataUri)
    } catch (error) {
    }
  }
  
  return null
}

function downloadFromUrl(urlString) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlString)
    } catch (error) {
      reject(new Error(`Invalid URL: ${urlString}`))
      return
    }
    
    const protocol = url.protocol === 'https:' ? https : http
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
        'Accept': '*/*',
        'X-Tool': 'unmapx/incogbyte',
      },
    }
    
    const req = protocol.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFromUrl(res.headers.location))
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: Failed to download ${urlString}`))
        return
      }
      
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8')
        resolve(data)
      })
    })
    
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error(`Timeout downloading ${urlString}`))
    })
    
    req.on('error', (error) => {
      reject(new Error(`Failed to download ${urlString}: ${error.message}`))
    })
    
    req.end()
  })
}

async function readSourceMapFromUrl(urlString) {
  try {
    const data = await downloadFromUrl(urlString)
    
    try {
      return JSON.parse(data)
    } catch (jsonError) {
      const inlineUrl = extractInlineSourceMapUrl(data)
      if (inlineUrl) {
        const decoded = decodeBase64SourceMap(inlineUrl)
        if (decoded) {
          return decoded
        }
        
        if (inlineUrl.startsWith('http://') || inlineUrl.startsWith('https://')) {
          return readSourceMapFromUrl(inlineUrl)
        } else {
          const baseUrl = new URL(urlString)
          const resolvedUrl = new URL(inlineUrl, baseUrl).toString()
          return readSourceMapFromUrl(resolvedUrl)
        }
      }
      
      const decoded = decodeBase64SourceMap(data.trim())
      if (decoded) {
        return decoded
      }
      
      throw new Error(`URL does not contain a valid source map: ${urlString}`)
    }
  } catch (error) {
    if (error.message.includes('Invalid URL') || error.message.includes('Failed to download')) {
      throw error
    }
    throw new Error(`Failed to read source map from URL ${urlString}: ${error.message}`)
  }
}

function normalizeSourceMap(sourceMap) {
  if (!sourceMap || typeof sourceMap !== 'object') {
    throw new Error('Invalid source map: must be an object')
  }
  
  if (sourceMap.sections) {
    return normalizeIndexedSourceMap(sourceMap)
  }
  
  if (Array.isArray(sourceMap.sources) && (!sourceMap.sourcesContent || sourceMap.sourcesContent.length === 0)) {
    if (sourceMap.x_google_ignoreList) {
      sourceMap.sourcesContent = sourceMap.sources.map(() => null)
    }
  }
  
  if (Array.isArray(sourceMap.sources)) {
    if (!Array.isArray(sourceMap.sourcesContent)) {
      sourceMap.sourcesContent = []
    }
    
    while (sourceMap.sourcesContent.length < sourceMap.sources.length) {
      sourceMap.sourcesContent.push(null)
    }
    if (sourceMap.sourcesContent.length > sourceMap.sources.length) {
      sourceMap.sourcesContent = sourceMap.sourcesContent.slice(0, sourceMap.sources.length)
    }
  }
  
  if (!sourceMap.sourceRoot && sourceMap.sourceRoot !== '') {
    sourceMap.sourceRoot = sourceMap.sourceRoot || ''
  }
  
  return sourceMap
}

function normalizeIndexedSourceMap(indexedMap) {
  if (!indexedMap.sections || !Array.isArray(indexedMap.sections)) {
    throw new Error('Invalid indexed source map: missing sections array')
  }
  
  const mergedSources = []
  const mergedSourcesContent = []
  const mergedMappings = []
  let mergedNames = indexedMap.names || []
  let mergedFile = indexedMap.file || ''
  let mergedSourceRoot = indexedMap.sourceRoot || ''
  
  for (const section of indexedMap.sections) {
    if (!section.offset || !section.map) {
      continue
    }
    
    const offset = section.offset
    const map = section.map
    
    if (map.sources) {
      mergedSources.push(...map.sources)
    }
    
    if (map.sourcesContent) {
      mergedSourcesContent.push(...map.sourcesContent)
    } else if (map.sources) {
      mergedSourcesContent.push(...map.sources.map(() => null))
    }
    
    if (map.names) {
      const existingNamesCount = mergedNames.length
      mergedNames.push(...map.names)
    }
    
    if (map.mappings) {
      mergedMappings.push({
        offset: offset,
        mappings: map.mappings
      })
    }
  }
  
  return {
    version: indexedMap.version || 3,
    file: mergedFile,
    sourceRoot: mergedSourceRoot,
    sources: mergedSources,
    sourcesContent: mergedSourcesContent,
    names: mergedNames,
    mappings: mergedMappings,
    _indexed: true
  }
}

async function readSourceMapFromFile(filepath) {
  try {
    const data = await fs.readFile(filepath, 'utf8')
    
    try {
      return JSON.parse(data)
    } catch (jsonError) {
      const inlineUrl = extractInlineSourceMapUrl(data)
      if (inlineUrl) {
        const decoded = decodeBase64SourceMap(inlineUrl)
        if (decoded) {
          return decoded
        }
        
        const sourceMapPath = path.resolve(path.dirname(filepath), inlineUrl)
        try {
          const sourceMapData = await fs.readFile(sourceMapPath, 'utf8')
          return JSON.parse(sourceMapData)
        } catch (error) {
          throw new Error(`Failed to read source map from ${sourceMapPath}: ${error.message}`)
        }
      }
      
      throw new Error(`File does not contain a valid source map: ${filepath}`)
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Source map file not found: ${filepath}`)
    }
    throw error
  }
}

async function readInlineSourceMap(jsFilePath) {
  const sourceCode = await fs.readFile(jsFilePath, 'utf8')
  const sourceMapUrl = extractInlineSourceMapUrl(sourceCode)
  
  if (!sourceMapUrl) {
    throw new Error(`No inline source map found in ${jsFilePath}`)
  }
  
  const decoded = decodeBase64SourceMap(sourceMapUrl)
  if (decoded) {
    return decoded
  }
  
  const sourceMapPath = path.resolve(path.dirname(jsFilePath), sourceMapUrl)
  return readSourceMapFromFile(sourceMapPath)
}

async function spit(filepath, data) {
  const dirpath = path.dirname(filepath)
  await fs.mkdir(dirpath, {recursive: true})
  return fs.writeFile(filepath, data)
}

async function dumpSource(source, sourceContent, sourceRoot, dirpath, options = {}) {
  if (sourceContent === null || sourceContent === undefined) {
    if (options.skipMissing) {
      return null
    }
    if (options.createPlaceholders) {
      sourceContent = `// Source content not available for: ${source}\n`
    } else {
      throw new Error(`Missing source content for: ${source}`)
    }
  }

  // Normalize the source path to handle relative paths like ../node_modules/...
  // Split by path separator, sanitize each component, then rejoin
  const pathParts = source.split(/[/\\]/).filter(part => part && part !== '.')
  const sanitizedParts = pathParts.map(part => {
    if (part === '..') {
      return '__parent__'  // Replace .. with safe directory name
    }
    return sanitizeFilename(part, options)
  })

  const sourcePath = path.join(...sanitizedParts)
  const sourceFilepath = path.join(dirpath, sourceRoot || '', sourcePath)

  if (options.verbose) {
    options.logger?.info(`Extracting: ${source} -> ${sourceFilepath}`)
  }

  if (options.dryRun) {
    return sourceFilepath
  }

  await spit(sourceFilepath, sourceContent)

  return sourceFilepath
}

function dumpSourceMap(sourceMapData, dirpath, options = {}) {
  const sourceMap = normalizeSourceMap(sourceMapData)
  const {sources, sourcesContent, sourceRoot} = sourceMap
  
  if (!Array.isArray(sources)) {
    throw new Error('Invalid source map: sources must be an array')
  }
  
  if (options.verbose) {
    options.logger?.info(`Processing source map with ${sources.length} source(s)`)
    if (sourceMap._indexed) {
      options.logger?.info('Detected indexed source map format')
    }
  }
  
  const sourcePromises = sources.map((source, i) => {
    const sourceContent = sourcesContent[i]
    if ((sourceContent === null || sourceContent === undefined) && options.skipMissing) {
      return Promise.resolve(null)
    }
    return dumpSource(source, sourceContent, sourceRoot || '', dirpath, options)
  })
  
  return Promise.all(sourcePromises).then(results => 
    results.filter(result => result !== null)
  )
}

async function dumpFile(filepath, dirpath, sourceRoot, options = {}) {
  let sourceMap
  
  if (filepath.startsWith('http://') || filepath.startsWith('https://')) {
    if (options.isJsFile) {
      const jsContent = await downloadFromUrl(filepath)
      const inlineUrl = extractInlineSourceMapUrl(jsContent)
      if (inlineUrl) {
        const decoded = decodeBase64SourceMap(inlineUrl)
        if (decoded) {
          sourceMap = decoded
        } else if (inlineUrl.startsWith('http://') || inlineUrl.startsWith('https://')) {
          sourceMap = await readSourceMapFromUrl(inlineUrl)
        } else {
          const baseUrl = new URL(filepath)
          const resolvedUrl = new URL(inlineUrl, baseUrl).toString()
          sourceMap = await readSourceMapFromUrl(resolvedUrl)
        }
      } else {
        throw new Error(`No inline source map found in JavaScript file: ${filepath}`)
      }
    } else {
      sourceMap = await readSourceMapFromUrl(filepath)
    }
  }
  else if (filepath === '/dev/stdin' || filepath === '-') {
    const chunks = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk)
    }
    const inputData = Buffer.concat(chunks).toString('utf8')
    
    try {
      sourceMap = JSON.parse(inputData)
    } catch (error) {
      const inlineUrl = extractInlineSourceMapUrl(inputData)
      if (inlineUrl) {
        const decoded = decodeBase64SourceMap(inlineUrl)
        if (decoded) {
          sourceMap = decoded
        } else {
          throw new Error(`Failed to parse source map from stdin: ${error.message}`)
        }
      } else {
        throw new Error(`Failed to parse source map from stdin: ${error.message}`)
      }
    }
  } else {
    const isJsFile = filepath.endsWith('.js') || filepath.endsWith('.mjs') || filepath.endsWith('.cjs')
    
    if (isJsFile && !filepath.endsWith('.map')) {
      try {
        sourceMap = await readInlineSourceMap(filepath)
      } catch (error) {
        const mapFilePath = filepath + '.map'
        try {
          sourceMap = await readSourceMapFromFile(mapFilePath)
        } catch (mapError) {
          throw new Error(`No source map found for ${filepath}. Tried inline and ${mapFilePath}`)
        }
      }
    } else {
      sourceMap = await readSourceMapFromFile(filepath)
    }
  }
  
  if (sourceRoot !== undefined && sourceRoot !== null) {
    sourceMap.sourceRoot = sourceRoot
  }
  
  return dumpSourceMap(sourceMap, dirpath, options)
}

async function dumpMultipleFiles(filepaths, baseDirpath, sourceRoot, options = {}) {
  const results = {}
  
  for (const filepath of filepaths) {
    const outputDir = options.separateDirs 
      ? path.join(baseDirpath, path.basename(filepath, path.extname(filepath)))
      : baseDirpath
    
    try {
      const writtenFiles = await dumpFile(filepath, outputDir, sourceRoot, options)
      results[filepath] = writtenFiles
    } catch (error) {
      if (options.continueOnError) {
        results[filepath] = { error: error.message }
      } else {
        throw error
      }
    }
  }
  
  return results
}

async function getAllFiles(dirPath, fileList = []) {
  try {
    const files = await readdir(dirPath)
    
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const fileStat = await stat(filePath)
      
      if (fileStat.isDirectory()) {
        await getAllFiles(filePath, fileList)
      } else {
        fileList.push(filePath)
      }
    }
    
    return fileList
  } catch (error) {
    return fileList
  }
}

function extractUrlsFromText(text) {
  const urlRegex = /(https?:\/\/[^\s"'<>{}|\\^`\[\]]+)/gi
  const urls = new Set()
  
  const matches = text.matchAll(urlRegex)
  for (const match of matches) {
    try {
      const url = new URL(match[1])
      urls.add(url.toString())
    } catch (error) {
    }
  }
  
  return Array.from(urls)
}

async function extractLinksFromDirectory(dirPath) {
  const allUrls = new Set()
  
  try {
    const files = await getAllFiles(dirPath)
    
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf8')
        const urls = extractUrlsFromText(content)
        urls.forEach(url => allUrls.add(url))
      } catch (error) {
      }
    }
  } catch (error) {
    throw new Error(`Failed to extract links from directory: ${error.message}`)
  }
  
  return Array.from(allUrls).sort()
}

function createLogger(verbose = false, quiet = false) {
  return {
    debug: (msg) => {
      if (verbose && !quiet) {
        console.error(`[DEBUG] ${msg}`)
      }
    },
    info: (msg) => {
      if (!quiet) {
        console.error(msg)
      }
    },
    error: (msg) => {
      if (!quiet) {
        console.error(msg)
      }
    },
    warn: (msg) => {
      if (!quiet) {
        console.error(`[WARN] ${msg}`)
      }
    }
  }
}

module.exports = {
  dumpSource,
  dumpSourceMap,
  dumpFile,
  dumpMultipleFiles,
  readInlineSourceMap,
  readSourceMapFromFile,
  readSourceMapFromUrl,
  downloadFromUrl,
  extractInlineSourceMapUrl,
  decodeBase64SourceMap,
  normalizeSourceMap,
  normalizeIndexedSourceMap,
  extractLinksFromDirectory,
  sanitizeFilename,
  createLogger,
}
