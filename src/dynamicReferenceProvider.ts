import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

export class DynamicReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!wordRange) {
      return [];
    }

    const word = document.getText(wordRange);
    console.log(`Searching for references of: ${word}`);

    const locations: vscode.Location[] = [];

    try {
      const files = await vscode.workspace.findFiles(
        "**/*.{js,jsx,ts,tsx}",
        "**/{node_modules,dist,.next}/**"
      );

      // console.log(`🔍 Scanning ${files.length} files for references...`);
      files.forEach((file) => {
        console.log(`📄 Scanning file: ${file.fsPath}`);
      });

      await Promise.all(
        files.map(async (file) => {
          if (token.isCancellationRequested) {
            return;
          }

          try {
            const text = await fs.readFile(file.fsPath, "utf8");

            const regex =
              /(dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;

            let match;
            while ((match = regex.exec(text))) {
              const _importMethod = match[1];
              const importedPath = match[2];

              console.log(
                `🔎 Matched dynamic import: ${match[0]} in ${file.fsPath} as ${match[2]}`
              );
              console.log(
                `🔎 Import method: ${file.fsPath} - ${path.dirname(
                  file.fsPath
                )} - in ${importedPath}`
              );

              let absoluteImportPath = path.resolve(
                path.dirname(file.fsPath),
                importedPath
              );

              console.log(`Checking: ${absoluteImportPath}`);

              try {
                const stat = await fs.stat(absoluteImportPath);
                console.log(`Found: ${absoluteImportPath}`);
                if (stat.isDirectory()) {
                  const files = await fs.readdir(absoluteImportPath);
                  console.log(
                    `Found ${files.length} files in: ${absoluteImportPath}`
                  );
                  const entryFile = files.find((file) =>
                    /\.(js|jsx|ts|tsx)$/.test(file)
                  );
                  if (entryFile) {
                    console.log(`Found entry file: ${entryFile}`);
                    absoluteImportPath = path.join(
                      absoluteImportPath,
                      entryFile
                    );
                  }
                }
              } catch {
                // console.warn(
                //   `⚠️ Could not resolve directory: ${absoluteImportPath}, trying extensions...`
                // );
                const extensions = [".tsx", ".ts", ".jsx", ".js"];
                let resolved = false;
                for (const ext of extensions) {
                  const testPath = `${absoluteImportPath}${ext}`;
                  try {
                    await fs.access(testPath);
                    absoluteImportPath = testPath;
                    console.log(
                      `✅ Resolved using extension: ${absoluteImportPath}`
                    );
                    resolved = true;
                    break;
                  } catch (error) {
                    console.log(
                      `🚫 Extension not found: ${testPath} - ${error}`
                    );
                  }
                }
                if (!resolved) {
                  console.warn(
                    `❌ Final resolution failed for: ${absoluteImportPath}`
                  );
                }
              }

              const fileName = path.basename(
                absoluteImportPath,
                path.extname(absoluteImportPath)
              );

              // ✅ Extract component name if exported as default
              let componentName: string | null = null;
              try {
                const importedText = await fs.readFile(
                  absoluteImportPath,
                  "utf8"
                );
                const componentRegex = /export\s+default\s+(\w+)/;
                const componentMatch = componentRegex.exec(importedText);
                componentName = componentMatch ? componentMatch[1] : null;
              } catch (error) {
                console.log(
                  `⚠️ Could not read file for component extraction: ${absoluteImportPath}`
                );
              }

              console.log(
                `Comparing: fileName='${fileName}', componentName='${componentName}', word='${word}'`
              );

              /**
               * Check if the file path contains the relative import path.
               * It removes relative parts (`./`, `../`) from paths before checking.
               *
               * @param {string} importedPath - The relative or absolute imported path.
               * @param {string} absoluteImportPath - The absolute file path.
               * @returns {boolean}
               * @example
               * checkIfImportedPathIsInAbsoluteImportPath('./mobile/groups', '/Users/josepejonavarro/Documents/GitHub/bs-logifuture-portals/apps/bs-sportsbook/src/4-features/matches/ui/desktop/groups.tsx');
               */
              const isIncluded = (
                importedPath: string,
                absoluteImportPath: string
              ): boolean => {
                const normalizedImportedPath = path
                  .normalize(importedPath)
                  .replace(/^(\.\/|\.\.\/)*/, "");
  
                const normalizedAbsoluteImportPath = path
                  .normalize(absoluteImportPath)
                  .replace(/\.[jt]sx?$/, "");

                const importedPathArray = normalizedImportedPath.split(
                  path.sep
                );
                const absoluteImportPathArray =
                  normalizedAbsoluteImportPath.split(path.sep);

                console.log(
                  "Match found at: --> importedPathArray:",
                  importedPathArray
                );
                console.log(
                  "Match found at: --> absoluteImportPathArray:",
                  absoluteImportPathArray
                );

                const isPathContained =
                  !absoluteImportPathArray?.length ||
                  importedPathArray.every((segment) =>
                    absoluteImportPathArray.includes(segment)
                  );

                return isPathContained;
              };

              if (
                fileName.toLowerCase().trim() === word.toLowerCase().trim() ||
                (componentName &&
                  componentName.toLowerCase().trim() ===
                    word.toLowerCase().trim())
                // && check that the file path contains the relative import path
              ) {
                const index = match.index;
                const lines = text.slice(0, index).split("\n");
                const line = lines.length - 1;
                const char = index - text.lastIndexOf("\n", index - 1) - 1;

                console.log(
                  `✅ Match found at: ${file.fsPath}:${line + 1}:${char}`
                );
                console.log(
                  "Match found at Path from dynamic import:",
                  absoluteImportPath
                );
                console.log(" Match found at Path from file:", file.fsPath);
                console.log(
                  "Match found at Path from importedPath:",
                  importedPath
                );
                if (isIncluded(importedPath, document.uri.fsPath)) {
                  locations.push(
                    new vscode.Location(file, new vscode.Position(line, char))
                  );
                }
              } else {
                console.log(
                  `🚫 No match: '${fileName}' != '${word}', '${componentName}' != '${word}'`
                );
              }
            }
          } catch (fileError) {
            console.error(`❌ Error reading file: ${file.fsPath}`, fileError);
          }
        })
      );

      console.log(`Found ${locations.length} references for '${word}'.`);
    } catch (error) {
      console.error("❌ Error in provideReferences:", error);
    }

    return locations;
  }
}
