import * as path from "node:path";
import * as vscode from "vscode";
import { analyzeTargetFileExports } from "../ast/analyze-target-exports";
import { parseCodeToAST } from "../ast/ast-utils";
import { analyzeDynamicImports } from "../ast/dynamic-import-analyzer";
import { isIncluded } from "../fs/is-path-included";
import { findImportRefNames } from "../resolver/find-import-references-names";

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
  const shouldSearch = nameEqual || componentEqual;

  if (shouldSearch && isIncluded(importedPath, documentPath)) {
    const lines = text.slice(0, matchIndex).split("\n");
    const line = lines.length - 1;
    const char = matchIndex - text.lastIndexOf("\n", matchIndex - 1) - 1;

    const targetExportInfo = await analyzeTargetFileExports(documentPath, word);

    const fileContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(file)
    );
    const ast = parseCodeToAST(fileContent);

    const names = await findImportRefNames({
      fileUri: file,
      importedPath,
      aliases,
      tsConfigDir,
      hasAlias,
      exportInfo: targetExportInfo,
      ast,
    });

    const textLines = text.slice(0, matchIndex).split("\n");
    const currentLine = textLines.length - 1;

    const { locations, shouldIncludeCurrentImportDeclaration } =
      analyzeDynamicImports(file, names, currentLine, ast);

    if (shouldIncludeCurrentImportDeclaration) {
      locations.push(
        new vscode.Location(file, new vscode.Position(line, char))
      );
    }

    if (locations.length) {
      return locations;
    }

    return locations;
  }

  return [];
}
