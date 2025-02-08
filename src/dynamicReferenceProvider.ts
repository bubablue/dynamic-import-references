import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class DynamicReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
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
      const files = await vscode.workspace.findFiles('**/*.{js,jsx,ts,tsx}', '**/node_modules/**');
      console.log(`Found ${files.length} files to search.`);

      await Promise.all(
        files.map(async (file) => {
          if (token.isCancellationRequested) {
            console.log('Search canceled by the user.');
            return;
          }

          try {
            const text = await fs.readFile(file.fsPath, 'utf8');

            // Regex to match both dynamic() and lazy() imports
            const regex = new RegExp(`(dynamic|lazy)\\(.*?import\\(['"](.+?)['"]\\)`, 'gi');

            let match;
            while ((match = regex.exec(text))) {
              const importMethod = match[1]; // dynamic or lazy
              const importedPath = match[2]; // e.g., '../ui/desktop/component'

              // Resolve the absolute path of the imported file
              const absoluteImportPath = path.resolve(path.dirname(file.fsPath), importedPath);
              const fileName = path.basename(absoluteImportPath, path.extname(absoluteImportPath)); // 'component'

              // Match if the file name equals the selected word (case-insensitive)
              if (fileName.toLowerCase() === word.toLowerCase()) {
                const index = match.index;
                const lines = text.slice(0, index).split('\n');
                const line = lines.length - 1;
                const char = index - text.lastIndexOf('\n', index - 1) - 1;

                console.log(`✅ Found ${importMethod} reference in ${file.fsPath}:${line + 1}`);

                locations.push(new vscode.Location(file, new vscode.Position(line, char)));
              }
            }
          } catch (fileError) {
            console.error(`❌ Error reading file: ${file.fsPath}`, fileError);
          }
        })
      );

      console.log(`Found ${locations.length} references for '${word}'.`);
    } catch (error) {
      console.error('❌ Error in provideReferences:', error);
    }

    return locations;
  }
}
