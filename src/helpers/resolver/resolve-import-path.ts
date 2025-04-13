import * as fs from "fs/promises";
import * as path from "path";

const extensions = [".tsx", ".ts", ".jsx", ".js"];
const extPattern = /\.(js|jsx|ts|tsx)$/;

export async function resolveImportPath(
  targetPath: string,
  basePath: string
): Promise<string> {
  const resolvedPath = path.resolve(path.dirname(basePath), targetPath);

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      const files = await fs.readdir(resolvedPath);
      const entryFile = files.find((file) => extPattern.test(file));
      if (entryFile) {
        return path.join(resolvedPath, entryFile);
      }
    }
  } catch {
    for (const ext of extensions) {
      const testPath = `${resolvedPath}${ext}`;
      try {
        await fs.stat(testPath);
        return testPath;
      } catch {
        console.log(`🚫 Extension not found: ${testPath}`);
      }
    }
  }

  console.warn(`❌ Final resolution failed for: ${resolvedPath}`);
  return resolvedPath;
}
