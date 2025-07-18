import * as fs from "fs/promises";
import { ts_declare_regex } from "../regexp";

export async function extractComponentNames(
  filePath: string,
  documentPath: string
): Promise<string[]> {
  if (filePath !== documentPath) {
    return [];
  }

  try {
    const text = await fs.readFile(filePath, "utf8");
    const matches = [...text.matchAll(ts_declare_regex)].map(
      (match) => match[1]
    );

    return matches.length > 0 ? matches : [];
  } catch {
    console.log(`Could not read file for component extraction: ${filePath}`);
    return [];
  }
}
