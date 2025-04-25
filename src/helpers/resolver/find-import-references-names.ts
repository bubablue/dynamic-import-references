import * as vscode from "vscode";
import { tsx_full_dynamic_regex } from "../regexp";
import { resolveAlias } from "../ts-config/resolve-alias";

interface FindImportRefNamesParams {
  fileUri: vscode.Uri;
  importedPath: string;
  aliases?: Record<string, string[]>;
  tsConfigDir?: string;
  hasAlias: boolean;
}

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

    const matches = [...fileContent.matchAll(tsx_full_dynamic_regex)];

    const resolve = (match: string) =>
      !!aliases && !!tsConfigDir && !!hasAlias
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
