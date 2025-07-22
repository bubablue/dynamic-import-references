import * as fs from "fs/promises";
import * as path from "path";
import { ext_pattern_regex, extensions } from "../regexp";
import { log } from "../utils/logger";

export async function resolveImportPath(
  targetPath: string,
  basePath: string
): Promise<string[]> {
  const resolvedPath = path.resolve(path.dirname(basePath), targetPath);

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      const files = await fs.readdir(resolvedPath);
      const entryFiles = files.filter((file) => ext_pattern_regex.test(file));
      if (entryFiles?.length) {
        const entryPaths = entryFiles.map((file) =>
          path.join(resolvedPath, file)
        );
        return entryPaths;
      }
    }
  } catch {
    for (const ext of extensions) {
      const testPath = `${resolvedPath}${ext}`;
      try {
        await fs.stat(testPath);
        return [testPath];
      } catch {}
    }
  }

  log.warn(`Final resolution failed for: ${resolvedPath}`);
  return [];
}
