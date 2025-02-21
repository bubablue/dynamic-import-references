import * as fs from "fs/promises";

export async function extractComponentName(
  filePath: string
): Promise<string | null> {
  const regex = /export\s+default\s+(\w+)/;

  try {
    const text = await fs.readFile(filePath, "utf8");
    const match = regex.exec(text);
    return match ? match[1] : null;
  } catch {
    console.log(`⚠️ Could not read file for component extraction: ${filePath}`);
    return null;
  }
}
