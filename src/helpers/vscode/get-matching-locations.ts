import * as path from "path";
import * as vscode from "vscode";
import { isIncluded } from "../fs/is-path-included";

export function getMatchingLocations(
  file: vscode.Uri,
  word: string,
  componentName: string | null,
  documentPath: string,
  importedPath: string
): vscode.Location | null {
  const fileName = path.basename(importedPath, path.extname(importedPath));

  if (
    fileName.toLowerCase().trim() === word.toLowerCase().trim() ||
    (componentName &&
      componentName.toLowerCase().trim() === word.toLowerCase().trim())
  ) {
    if (isIncluded(importedPath, documentPath)) {
      return new vscode.Location(file, new vscode.Position(0, 0));
    }
  } else {
    console.log(
      `🚫 No match: '${fileName}' != '${word}', '${componentName}' != '${word}'`
    );
  }

  return null;
}
