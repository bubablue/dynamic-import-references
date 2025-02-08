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
        "**/node_modules/**"
      );

      await Promise.all(
        files.map(async (file) => {
          if (token.isCancellationRequested) {
            return;
          }

          try {
            const text = await fs.readFile(file.fsPath, "utf8");

            const regex = /(dynamic|lazy)\(.*?import\(['"](.+?)['"]\)/gi;

            let match;
            while ((match = regex.exec(text))) {
              const _importMethod = match[1];
              const importedPath = match[2];

              const absoluteImportPath = path.resolve(
                path.dirname(file.fsPath),
                importedPath
              );
              const fileName = path.basename(
                absoluteImportPath,
                path.extname(absoluteImportPath)
              );

              if (fileName.toLowerCase() === word.toLowerCase()) {
                const index = match.index;
                const lines = text.slice(0, index).split("\n");
                const line = lines.length - 1;
                const char = index - text.lastIndexOf("\n", index - 1) - 1;

                locations.push(
                  new vscode.Location(file, new vscode.Position(line, char))
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
