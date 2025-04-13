import * as fs from "fs/promises";

const regex =
  /export\s+(?:default\s+)?(?:const|let|var|function|class)?\s*(\w+)/g;

export async function extractComponentNames(
  filePath: string,
  documentPath: string
): Promise<string[]> {
  if (filePath !== documentPath) {
    return [];
  }

  try {
    const text = await fs.readFile(filePath, "utf8");
    const matches = [...text.matchAll(regex)].map((match) => match[1]);

    return matches.length > 0 ? matches : [];
  } catch {
    console.log(`Could not read file for component extraction: ${filePath}`);
    return [];
  }
}
