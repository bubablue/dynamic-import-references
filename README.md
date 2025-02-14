# Dynamic Import References

[![VS Code Marketplace](https://img.shields.io/badge/VSCode-Extension-blue.svg?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.dynamic-import-references)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

🚀 **Enhance VS Code's "Find All References" feature by including dynamic and lazy imports in JavaScript and TypeScript files.**  
This extension ensures that references to dynamically imported modules are properly tracked, helping you navigate your codebase more efficiently.

---

## Features

✅ **Find References for Dynamic Imports:**  
🔍 Includes `import()` statements and lazy-loaded modules in "Find All References."  

✅ **Supports JavaScript & TypeScript:**  
📜 Works with `.js`, `.jsx`, `.ts`, and `.tsx` files.  

✅ **Seamless Integration:**  
⚡ Works natively with VS Code's "Find All References" feature.  

---

## Installation

1. Open **VS Code**.
2. Go to **Extensions** (`Ctrl+Shift+X` or `Cmd+Shift+X` on macOS).
3. Search for **Dynamic Import References**.
4. Click **Install**.
5. Restart VS Code if necessary.

---

## Usage

1. Open a **JavaScript** or **TypeScript** file.
2. Right-click on a function, variable, or import and select **Find All References**.
3. View all references, including dynamically imported modules.

---

## Commands

| Command                                     | Description                                     | Shortcut |
|---------------------------------------------|-----------------------------------------------|----------|
| `dynamic-import-references.findReferences` | Find references including dynamic imports.   | N/A      |

---

## Supported Languages

- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)

---

## Configuration

No additional configuration is required. The extension works automatically when enabled.

---

## Development

### Running the Extension Locally

1. Clone the repository:
   ```sh
   https://github.com/bubablue/dynamic-import-references
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Open in VS Code:
   ```sh
   code .
   ```
4. Run the extension:
   - Press `F5` to start a new **Extension Development Host**.

### Build & Package

To build and package the extension:

```sh
npm run package
```

---

## Contributing

Contributions are welcome! Please submit issues and pull requests on GitHub.

---

## License

This project is licensed under the **MIT License**.
```