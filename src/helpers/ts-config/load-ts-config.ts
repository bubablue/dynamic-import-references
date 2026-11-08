import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";

export interface TsConfigPaths {
  paths?: Record<string, string[]>;
  pathsBasePath?: string;
  baseUrl?: string;
}

interface RawTsConfig {
  extends?: string | string[];
  compilerOptions?: {
    paths?: Record<string, string[]>;
    baseUrl?: string;
  };
}

const isFile = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const readRawConfig = (configPath: string): RawTsConfig | undefined => {
  try {
    const parsed = parseJsonc(fs.readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const candidatesFor = (base: string): string[] => [
  base,
  `${base}.json`,
  path.join(base, "tsconfig.json"),
];

export function resolveExtendedConfig(
  specifier: string,
  fromDir: string
): string | undefined {
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return candidatesFor(path.resolve(fromDir, specifier)).find(isFile);
  }

  let dir = fromDir;
  for (;;) {
    const found = candidatesFor(path.join(dir, "node_modules", specifier)).find(
      isFile
    );
    if (found) {
      return found;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function loadTsConfig(
  configPath: string,
  chain: ReadonlySet<string> = new Set()
): TsConfigPaths {
  const absolutePath = path.resolve(configPath);
  if (chain.has(absolutePath)) {
    return {};
  }

  const config = readRawConfig(absolutePath);
  if (!config) {
    return {};
  }

  const configDir = path.dirname(absolutePath);
  const nextChain = new Set(chain).add(absolutePath);
  const parents =
    config.extends === undefined
      ? []
      : Array.isArray(config.extends)
        ? config.extends
        : [config.extends];

  let result: TsConfigPaths = {};
  for (const parent of parents) {
    if (typeof parent !== "string") {
      continue;
    }
    const parentPath = resolveExtendedConfig(parent, configDir);
    if (parentPath) {
      result = { ...result, ...loadTsConfig(parentPath, nextChain) };
    }
  }

  const options = config.compilerOptions ?? {};
  if (typeof options.baseUrl === "string") {
    result.baseUrl = path.resolve(configDir, options.baseUrl);
  }
  if (options.paths && typeof options.paths === "object") {
    result.paths = options.paths;
    result.pathsBasePath = configDir;
  }

  return result;
}
