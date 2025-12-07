import * as path from "node:path";
import * as vscode from "vscode";
import { processFile } from "./helpers/code/process-file";
import { findFile } from "./helpers/fs/find-file";
import { loadTsConfig } from "./helpers/ts-config/load-ts-config";
import { log } from "./helpers/utils/logger";

const includedFiles = "**/*.{js,jsx,ts,tsx}";
const excludedFiles = "**/{node_modules,dist,.next}/**";

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

    const tsConfigPath = await findFile(document.uri.fsPath, "tsconfig.json");
    const aliases = tsConfigPath ? await loadTsConfig(tsConfigPath) : {};
    const tsConfigDir = tsConfigPath ? path.dirname(tsConfigPath) : "";
    const hasAlias = !!tsConfigPath && Object.keys(aliases).length > 0;

    const word = document.getText(wordRange);

    try {
      const files = await vscode.workspace.findFiles(
        includedFiles,
        excludedFiles
      );

      const locations = (
        await Promise.all(
          files.map((file) =>
            processFile({
              file,
              word,
              documentPath: document.uri.fsPath,
              token,
              aliases,
              tsConfigDir,
              hasAlias,
            })
          )
        )
      ).flat();

      return locations;
    } catch (error) {
      log.error("Error in provideReferences:", error);
      return [];
    }
  }
}
