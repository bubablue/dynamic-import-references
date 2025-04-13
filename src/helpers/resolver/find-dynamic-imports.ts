import * as vscode from "vscode";
import { getMatchingLocations } from "../code/get-matching-locations";
import { resolveAlias } from "../ts-config/resolve-alias";
import { extractComponentNames } from "./find-component-name";
import { resolveImportPath } from "./resolve-import-path";

const regex = /(dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;

interface FindDynamicImportsParams {
  file: vscode.Uri;
  text: string;
  word: string;
  documentPath: string;
  hasAlias: boolean;
  tsConfigDir?: string;
  aliases?: Record<string, string[]>;
}

export async function findDynamicImports({
  file,
  text,
  word,
  documentPath,
  tsConfigDir,
  aliases,
  hasAlias,
}: FindDynamicImportsParams): Promise<vscode.Location[]> {
  const matches = Array.from(text.matchAll(regex));

  const locations = await Promise.all(
    matches.map(async (match) => {
      const importedPath =
        hasAlias && !!aliases && tsConfigDir
          ? resolveAlias(match[2], aliases, tsConfigDir)
          : match[2];

      const absoluteImportPath = await resolveImportPath(
        importedPath,
        file.fsPath
      );

      const componentNames = await extractComponentNames(
        absoluteImportPath,
        documentPath
      );

      if (!componentNames?.length) {
        return [];
      }

      const result = await Promise.all(
        componentNames.map(async (componentName) => {
          const foundLocations = await getMatchingLocations({
            file,
            word,
            componentName,
            documentPath,
            importedPath,
            text,
            matchIndex: match.index,
            tsConfigDir,
            aliases,
            hasAlias,
          });

          return foundLocations?.filter(Boolean);
        })
      );
      return result.flat();
    })
  );

  return locations.flat().filter(Boolean);
}
