# unmapx

[![npm version](https://badge.fury.io/js/unmapx.svg)](https://www.npmjs.com/package/unmapx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Extract and unpack JavaScript source maps from files, URLs, or inline base64. Supports indexed source maps, URL extraction, and cross-platform filename sanitization.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [Examples](#examples)
- [Advanced Features](#advanced-features)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Multiple Source Map Formats**: Supports direct `.map` files, inline source maps, base64-encoded maps, and indexed source maps
- **URL Downloads**: Download source maps from HTTP/HTTPS URLs with automatic format detection
- **URL Extraction**: Extract and display all URLs found in extracted source files
- **Webpack/Rollup Compatible**: Handles format variations from different bundlers
- **Flexible Output**: Organize output by source map or merge into single directory

## Installation

```bash
npm install -g unmapx
```

Or use locally without installation:

```bash
npx unmapx [options] <file>
```

## Usage

```bash
unmapx [options] <file> [file2 ...]
```

### Basic Usage

```bash
# Extract from a source map file
unmapx bundle.js.map

# Extract inline source map from JavaScript file
unmapx bundle.js

# Specify output directory
unmapx bundle.js.map --output extracted

# Process multiple source maps
unmapx app.js.map lib.js.map utils.js.map
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Print help message |
| `--version` | `-v` | Print version number |
| `--jsurl` | `-u` | URL to JavaScript file (extracts inline source map) |
| `--url` | | URL or path to source map file |
| `--output` | `-o` | Output directory (default: current directory) |
| `--sourceRoot` | | Override sourceRoot field in source map |
| `--extractlinks` | `-el` | Extract and display URLs found in extracted files |
| `--verbose` | `-V` | Show detailed progress and debug information |
| `--quiet` | `-q` | Suppress all output except errors |
| `--separate-dirs` | | Put each source map in its own subdirectory |
| `--continue-on-error` | | Continue processing other files if one fails |
| `--skip-missing` | | Skip sources with missing content instead of erroring |
| `--create-placeholders` | | Create placeholder files for missing source content |

### Option Details

- **`--jsurl` / `-u`**: Use this option when you have a URL to a JavaScript file that contains an inline source map. The tool will download the JavaScript file and extract the source map from it.
  
  **Note**: Cannot be used together with `--url`

- **`--url`**: Use this option when you have a direct URL or file path to a source map file (`.map` file).
  
  **Note**: Cannot be used together with `--jsurl`

- **`--extractlinks` / `-el`**: After extracting source files, scans all extracted files for URLs and displays them. Requires `--output` to be explicitly specified.

- **`--verbose` / `-V`**: Enables detailed logging including debug information, file processing status, and source map format detection.

- **`--quiet` / `-q`**: Suppresses all informational output, only showing errors.

## Examples

### Extract from Local Files

```bash
# Extract from source map file
unmapx dist/bundle.js.map

# Extract inline source map from JavaScript
unmapx dist/bundle.js

# Extract to specific directory
unmapx bundle.js.map -o extracted
```

### Download from URLs

**Download JavaScript file and extract inline source map:**
```bash
unmapx --jsurl https://www.example.com/main.js --output foo
# or short form
unmapx -u https://www.example.com/main.js -o foo
```

**Download source map file directly:**
```bash
unmapx --url https://www.example.com/main.js.map --output foo
```

### Extract URLs from Extracted Files

```bash
unmapx -o extracted -el bundle.js.map
```

This will:
1. Extract all source files from the source map
2. Scan all extracted files for URLs
3. Display all unique URLs found

### Verbose and Quiet Modes

```bash
# Verbose mode - detailed progress
unmapx -V bundle.js.map

# Quiet mode - errors only
unmapx -q bundle.js.map

# Combine verbose with URL extraction
unmapx -o extracted -V -el bundle.js.map
```

### Organize Multiple Source Maps

```bash
# Each source map in its own directory
unmapx --separate-dirs app.js.map lib.js.map utils.js.map
# Creates: output/app/, output/lib/, output/utils/

# Continue processing even if one fails
unmapx --continue-on-error *.map
```

### Handle Missing Source Content

```bash
# Skip files with missing content
unmapx --skip-missing bundle.js.map

# Create placeholder files for missing content
unmapx --create-placeholders bundle.js.map
```

### Read from Stdin

```bash
echo '{"version":3,"sources":["app.js"],"mappings":""}' | unmapx -
```

## Advanced Features

### Indexed Source Maps

unmapx automatically detects and processes indexed source maps (format with `sections`). These are commonly used by tools that combine multiple source maps.

```bash
unmapx -V indexed-source-map.js.map
# Verbose mode will show: "Detected indexed source map format"
```

### Smart Filename Sanitization

The tool includes intelligent filename sanitization that:
- Handles Windows reserved names (CON, PRN, AUX, etc.)
- Removes invalid characters per platform
- Prevents path traversal attacks
- Truncates overly long filenames while preserving extensions
- Normalizes Unicode characters

### Base64-Encoded Source Maps

Automatically detects and decodes base64-encoded source maps embedded inline in JavaScript files:

```javascript
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjoz...
```

### Webpack/Rollup Format Support

Handles various format variations:
- Missing or mismatched `sourcesContent` arrays
- Different `sourceRoot` formats
- Webpack-specific extensions

## Supported Source Map Formats

-  Standard Source Map (v3)
-  Indexed Source Map (with sections)
-  Inline Source Maps (`//# sourceMappingURL=...`)
-  Base64-encoded Source Maps (`data:application/json;base64,...`)
-  Webpack-generated source maps
-  Rollup-generated source maps
-  Other bundler formats (with normalization)

## Requirements

- Node.js >= 12.0.0
- npm or yarn

## License

Copyright © 2024 Rodolfo 'incogbyte' Tavares

Licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Thanks 
@s4int
@chbrown/unmap
