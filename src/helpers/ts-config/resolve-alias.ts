import * as path from "node:path";
import { removeDuplicateSuffix } from "../fs/remove-duplicated-path";

export function resolveAlias(
  importPath: string,
  aliases: Record<string, string[]>,
  tsConfigDir: string
): string {
  const aliasEntry = Object.entries(aliases).find(([alias]) =>
    importPath.startsWith(alias.replace(/\*$/, ""))
  );

  if (!aliasEntry) {
    return importPath;
  }

  const [matchedAlias, targetPaths] = aliasEntry;
  const aliasPrefix = matchedAlias.replace(/\*$/, "");
  let aliasTarget = targetPaths[0].replace(/\*$/, "");

  if (!path.isAbsolute(aliasTarget)) {
    const basePath = removeDuplicateSuffix(tsConfigDir, aliasTarget);
    aliasTarget = path.resolve(basePath, aliasTarget);
  }
  const relativeImportPath = importPath.slice(aliasPrefix.length);
  const resolvedPath = path.join(aliasTarget, relativeImportPath);

  return resolvedPath;
}
