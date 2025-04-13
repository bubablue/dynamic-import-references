import * as fs from "fs/promises";
import * as vscode from "vscode";
import { findDynamicImports } from "../resolver/find-dynamic-imports";

interface ProcessFileParams {
  file: vscode.Uri;
  word: string;
  documentPath: string;
  token: vscode.CancellationToken;
  aliases?: Record<string, string[]>;
  tsConfigDir?: string;
  hasAlias: boolean;
}

export async function processFile({
  file,
  word,
  documentPath,
  token,
  tsConfigDir,
  aliases,
  hasAlias,
}: ProcessFileParams): Promise<vscode.Location[]> {
  if (token.isCancellationRequested) {
    return [];
  }

  try {
    const text = await fs.readFile(file.fsPath, "utf8");

    return findDynamicImports({
      file,
      text,
      word,
      documentPath,
      tsConfigDir,
      aliases,
      hasAlias,
    });
  } catch (fileError) {
    console.error(`Error reading file: ${file.fsPath}`, fileError);
    return [];
  }
}
