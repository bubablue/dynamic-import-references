import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

async function findTsConfig(filePath: string): Promise<string | null> {
  let currentDir = path.dirname(filePath);

  while (currentDir !== path.parse(currentDir).root) {
    const tsConfigPath = path.join(currentDir, "tsconfig.json");
    try {
      await fs.access(tsConfigPath);
      return tsConfigPath;
    } catch (error) {
      currentDir = path.dirname(currentDir);
    }
  }

  return null;
}

async function loadTsConfig(
  tsConfigPath: string
): Promise<Record<string, string[]>> {
  try {
    const rawConfig = await fs.readFile(tsConfigPath, "utf8");
    const config = JSON.parse(rawConfig);

    let paths: Record<string, string[]> = config.compilerOptions?.paths || {};

    if (config.extends) {
      const extendedTsConfigPath = path.resolve(
        path.dirname(tsConfigPath),
        config.extends
      );
      const extendedPaths = await loadTsConfig(extendedTsConfigPath);
      paths = { ...extendedPaths, ...paths };
    }

    return paths;
  } catch (error) {
    console.warn(`Failed to load tsconfig: ${tsConfigPath}`, error);
    return {};
  }
}

// type DataItem = { index: number; part: string };

// const groupConsecutiveIndexes = (arr: DataItem[]): DataItem[][] => {
//   if (arr.length === 0) return [];

//   // Sort by index in ascending order
//   const sortedArr = [...arr].sort((a, b) => a.index - b.index);

//   // Use reduce to group consecutive sequences
//   return sortedArr.reduce<DataItem[][]>((groups, item, i, src) => {
//     if (i === 0 || item.index !== src[i - 1].index + 1) {
//       groups.push([]); // Start a new group
//     }
//     groups[groups.length - 1].push(item);
//     return groups;
//   }, []);
// };

// function removeDuplicateSuffix(basePath: string, targetPath: string): string {
//   const baseParts = basePath.split(path.sep);
//   const targetParts = targetPath.split(path.sep);

//   const commonParts: { index: number; part: string }[] = baseParts
//     .map((part, index) => {
//       return { index, part };
//     })
//     .filter(({ part }) => targetParts.includes(part));

//   // Group consecutive indexes
//   const groups = groupConsecutiveIndexes(commonParts);

//   //pick last consecutive group
//   const lastGroup = groups[groups.length - 1];
//   const consecutivePath = lastGroup.map(({ part }) => part).join(path.sep);

//   if (basePath.endsWith(consecutivePath)) {
//     return basePath.replace(consecutivePath, "");
//   }

//   return basePath;
// }

const findAllMatchingSuffixPrefix = (basePath: string, targetPath: string) => {
  const suffixFragments = basePath.split('/');
  const prefixFragments = targetPath.split('/');

  let matches = [];

  for (let i = 1; i <= Math.min(suffixFragments.length, prefixFragments.length); i++) {
    const suffix = suffixFragments.slice(-i).join('/');
    const prefix = prefixFragments.slice(0, i).join('/');

    if (suffix === prefix) {
      matches.push(suffix);
    }
  }

  return matches.length ? matches?.join() : null;
};

function removeDuplicateSuffix(basePath: string, targetPath: string): string {
  const commonPath = findAllMatchingSuffixPrefix(basePath, targetPath);
  if (commonPath) {
    return basePath.replace(commonPath, '');
  }
  return basePath;
}


function resolveAlias(
  importPath: string,
  aliases: Record<string, string[]>,
  tsConfigDir: string
): string {
  const aliasEntry = Object.entries(aliases).find(([alias]) =>
    importPath.startsWith(alias.replace(/\*$/, ""))
  );

  if (!aliasEntry) {
    return importPath;
  }

  const [matchedAlias, targetPaths] = aliasEntry;
  const aliasPrefix = matchedAlias.replace(/\*$/, "");
  let aliasTarget = targetPaths[0].replace(/\*$/, "");

  if (!path.isAbsolute(aliasTarget)) {
    const basePath = removeDuplicateSuffix(tsConfigDir, aliasTarget);
    aliasTarget = path.resolve(basePath, aliasTarget);
  }
  // Strip the alias prefix from importPath
  const relativeImportPath = importPath.slice(aliasPrefix.length);
  // Join them for the final absolute path
  const resolvedPath = path.join(aliasTarget, relativeImportPath);

  return resolvedPath;
}

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

    const tsConfigPath = await findTsConfig(document.uri.fsPath);
    const aliases = tsConfigPath ? await loadTsConfig(tsConfigPath) : {};
    const tsConfigDir = tsConfigPath ? path.dirname(tsConfigPath) : "";

    const word = document.getText(wordRange);
    // console.log(`Searching for references of: ${word}`);

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
              // console.log(
              //   `🔎 Matched import method: ${match[2]} - alias ${resolveAlias(
              //     match[2],
              //     aliases,
              //     tsConfigDir
              //   )}`
              // );
              const importedPath = tsConfigPath ? resolveAlias(match[2], aliases, tsConfigDir) : match[2];

              // console.log(
              //   `🔎 Matched dynamic import: ${match[0]} in ${file.fsPath} as ${match[2]}`
              // );
              // console.log(
              //   `🔎 Import method: ${file.fsPath} - ${path.dirname(
              //     file.fsPath
              //   )} - in ${importedPath}`
              // );

              let absoluteImportPath =
                match[2] === importedPath
                  ? path.resolve(path.dirname(file.fsPath), importedPath)
                  : importedPath;

              // console.log(`Checking: ${absoluteImportPath}`);

              try {
                const stat = await fs.stat(absoluteImportPath);
                // console.log(
                //   `Found: ${absoluteImportPath} - stat is: ${JSON.stringify(
                //     stat
                //   )}`
                // );
                if (stat.isDirectory()) {
                  const files = await fs.readdir(absoluteImportPath);
                  // console.log(
                  //   `Found ${files.length} files in: ${absoluteImportPath}`
                  // );
                  const entryFile = files.find((file) =>
                    /\.(js|jsx|ts|tsx)$/.test(file)
                  );
                  if (entryFile) {
                    // console.log(`Found entry file: ${entryFile}`);
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
                  // console.log(`Test path: ${absoluteImportPath} ${testPath}`);
                  try {
                    await fs.stat(testPath);
                    absoluteImportPath = testPath;
                    // console.log(
                    //   `✅ Resolved using extension: ${absoluteImportPath}`
                    // );
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

              // console.log(
              //   `Comparing: fileName='${fileName}', componentName='${componentName}', word='${word}'`
              // );

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

                // console.log(
                //   "Match found at: --> importedPathArray:",
                //   importedPathArray
                // );
                // console.log(
                //   "Match found at: --> absoluteImportPathArray:",
                //   absoluteImportPathArray
                // );

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
              ) {
                const index = match.index;
                const lines = text.slice(0, index).split("\n");
                const line = lines.length - 1;
                const char = index - text.lastIndexOf("\n", index - 1) - 1;

                // console.log(
                //   `✅ Match found at: ${file.fsPath}:${line + 1}:${char}`
                // );
                // console.log(
                //   "Match found at Path from dynamic import:",
                //   absoluteImportPath
                // );
                // console.log(" Match found at Path from file:", file.fsPath);
                // console.log(
                //   "Match found at Path from importedPath:",
                //   importedPath
                // );
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

      // console.log(`Found ${locations.length} references for '${word}'.`);
    } catch (error) {
      console.error("❌ Error in provideReferences:", error);
    }

    return locations;
  }
}
