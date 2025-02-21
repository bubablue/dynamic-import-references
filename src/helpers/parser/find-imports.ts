import * as fs from "fs/promises";

export async function findImports(filePath: string): Promise<string[]> {
  const regex =
    /(dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;

  try {
    const text = await fs.readFile(filePath, "utf8");
    return [...text.matchAll(regex)].map((match) => match[2]);
  } catch (error) {
    console.error(`❌ Error reading file: ${filePath}`, error);
    return [];
  }
}
