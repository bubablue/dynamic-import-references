import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";

export async function loadTsConfig(
  tsConfigPath: string,
): Promise<Record<string, string[]>> {
  try {
    const rawConfig = await fs.readFile(tsConfigPath, "utf8");
    const config = parseJsonc(rawConfig);

    let paths: Record<string, string[]> = config.compilerOptions?.paths || {};

    if (config.extends) {
      const extendedTsConfigPath = path.resolve(
        path.dirname(tsConfigPath),
        config.extends,
      );
      const extendedPaths = await loadTsConfig(extendedTsConfigPath);
      paths = { ...extendedPaths, ...paths };
    }

    return paths;
  } catch (error) {
    console.warn(`Failed to load tsconfig: ${tsConfigPath}`, error);
    return {};
  }
}
