import * as vscode from "vscode";
import { getMatchingLocations } from "../code/get-matching-locations";
import { tsx_dynamic_regex } from "../regexp";
import { resolveAlias } from "../ts-config/resolve-alias";
import { extractComponentNames } from "./find-component-name";
import { resolveImportPath } from "./resolve-import-path";

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
  const matches = Array.from(text.matchAll(tsx_dynamic_regex));

  if (!matches?.length) {
    return [];
  }

  const locations = await Promise.all(
    matches.map(async (match) => {
      const resolvedPath = match[match.length - 1];
      const importedPath =
        !!hasAlias && !!aliases && !!tsConfigDir
          ? resolveAlias(resolvedPath, aliases, tsConfigDir)
          : resolvedPath;

      const absoluteImportPaths = await resolveImportPath(
        importedPath,
        file.fsPath
      );

      const componentNames = await Promise.all(
        absoluteImportPaths.map(async (absolutePath) => {
          const componentName = await extractComponentNames(
            absolutePath,
            documentPath
          );
          return componentName;
        })
      ).then((results) => results.flat());

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
