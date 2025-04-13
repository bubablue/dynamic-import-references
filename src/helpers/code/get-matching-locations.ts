import * as path from "path";
import * as vscode from "vscode";
import { isIncluded } from "../fs/is-path-included";
import { findImportRefNames } from "../resolver/find-import-references-names";
import { findLineAndCharPosition } from "../resolver/find-match-file-line";

interface MatchingLocationParams {
  file: vscode.Uri;
  word: string;
  componentName: string | null;
  documentPath: string;
  importedPath: string;
  text: string;
  matchIndex: number;
  tsConfigDir?: string;
  aliases?: Record<string, string[]>;
  hasAlias: boolean;
}

export async function getMatchingLocations({
  file,
  word,
  componentName,
  documentPath,
  importedPath,
  text,
  tsConfigDir,
  aliases,
  hasAlias,
  matchIndex,
}: MatchingLocationParams): Promise<vscode.Location[]> {
  const fileName = path.basename(importedPath, path.extname(importedPath));

  const normFileName = fileName.toLowerCase().trim();
  const normWord = word.toLowerCase().trim();
  const normComponentName = componentName?.toLowerCase().trim();

  const nameEqual = normFileName === normWord;
  const componentEqual = normComponentName === normWord;

  if ((nameEqual || componentEqual) && isIncluded(importedPath, documentPath)) {
    const lines = text.slice(0, matchIndex).split("\n");
    const line = lines.length - 1;
    const char = matchIndex - text.lastIndexOf("\n", matchIndex - 1) - 1;

    const names = await findImportRefNames({
      fileUri: file,
      importedPath,
      aliases,
      tsConfigDir,
      hasAlias,
    });

    const locations = names.flatMap((name) => {
      const regexp = new RegExp(`\\b${name}\\b`, "g");

      return [...text.matchAll(regexp)].map((match) => {
        const index = match.index ?? 0;
        const { line, char } = findLineAndCharPosition(text, index);
        return new vscode.Location(file, new vscode.Position(line, char));
      });
    });

    return locations?.length
      ? [...locations]
      : [new vscode.Location(file, new vscode.Position(line, char))];
  }

  return [];
}
