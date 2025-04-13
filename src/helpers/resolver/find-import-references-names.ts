import * as vscode from "vscode";
import { resolveAlias } from "../ts-config/resolve-alias";

interface FindImportRefNamesParams {
  fileUri: vscode.Uri;
  importedPath: string;
  aliases?: Record<string, string[]>;
  tsConfigDir?: string;
  hasAlias: boolean;
}

const regex =
  /(const|let|var|function)\s+(\w+)\s*=\s*(?:dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;


export async function findImportRefNames({
  fileUri,
  importedPath,
  aliases,
  tsConfigDir,
  hasAlias,
}: FindImportRefNamesParams): Promise<string[]> {
  try {
    const fileContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(fileUri)
    );

    const matches = [...fileContent.matchAll(regex)];

    const resolve = (match: string) =>
      aliases && tsConfigDir && hasAlias
        ? resolveAlias(match, aliases, tsConfigDir)
        : match;

    return matches
      .filter((match) => resolve(match[3]) === importedPath)
      .map((match) => match[2]);
  } catch (error) {
    console.error(`Error reading file: ${fileUri.fsPath}`, error);
    return [];
  }
}
