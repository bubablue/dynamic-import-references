import * as fs from "fs/promises";
import * as path from "path";

async function checkDir(
  dir: string,
  rootDir: string,
  fileName: string
): Promise<string | null> {
  const filePath = path.join(dir, fileName);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return dir === rootDir
      ? null
      : checkDir(path.dirname(dir), rootDir, fileName);
  }
}

export async function findFile(
  filePath: string,
  fileName: string
): Promise<string | null> {
  return checkDir(path.dirname(filePath), path.parse(filePath).root, fileName);
}
