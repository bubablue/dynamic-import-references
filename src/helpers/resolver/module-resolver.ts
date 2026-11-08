import * as fs from "node:fs";
import * as path from "node:path";
import { loadTsConfig, TsConfigPaths } from "../ts-config/load-ts-config";

export const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

const TS_EQUIVALENTS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const CONFIG_FILE_NAMES = ["tsconfig.json", "jsconfig.json"];

type EntryKind = "file" | "dir" | "missing";

interface PathsMatch {
  substitutions: string[];
  captured: string;
}

export function matchPathsPattern(
  paths: Record<string, string[]>,
  specifier: string
): PathsMatch | undefined {
  const exact = paths[specifier];
  if (Array.isArray(exact) && !specifier.includes("*")) {
    return { substitutions: exact, captured: "" };
  }

  let best: { prefixLength: number; match: PathsMatch } | undefined;
  for (const [pattern, substitutions] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1 || !Array.isArray(substitutions)) {
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    const fits =
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix);
    if (fits && (!best || prefix.length > best.prefixLength)) {
      best = {
        prefixLength: prefix.length,
        match: {
          substitutions,
          captured: specifier.slice(prefix.length, specifier.length - suffix.length),
        },
      };
    }
  }

  return best?.match;
}

export class ModuleResolver {
  private readonly entryKinds = new Map<string, EntryKind>();
  private readonly configPathByDir = new Map<string, string | null>();
  private readonly configs = new Map<string, TsConfigPaths>();
  private readonly resolutions = new Map<string, string | null>();

  resolve(specifier: string, fromFile: string): string | undefined {
    const fromDir = path.dirname(fromFile);
    const cacheKey = `${fromDir}\u0000${specifier}`;
    const cached = this.resolutions.get(cacheKey);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    const resolved = this.compute(specifier, fromDir);
    this.resolutions.set(cacheKey, resolved ?? null);
    return resolved;
  }

  invalidateFileSystem(): void {
    this.entryKinds.clear();
    this.configPathByDir.clear();
    this.resolutions.clear();
  }

  invalidateConfigs(): void {
    this.configs.clear();
    this.configPathByDir.clear();
    this.resolutions.clear();
  }

  private compute(specifier: string, fromDir: string): string | undefined {
    if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
      return this.probe(path.resolve(fromDir, specifier));
    }

    const config = this.configFor(fromDir);
    if (!config) {
      return undefined;
    }

    const match = config.paths ? matchPathsPattern(config.paths, specifier) : undefined;
    if (match !== undefined) {
      const base = config.baseUrl ?? config.pathsBasePath ?? fromDir;
      for (const substitution of match.substitutions) {
        const resolved = this.probe(path.resolve(base, substitution.replace("*", match.captured)));
        if (resolved) {
          return resolved;
        }
      }
    }

    if (config.baseUrl) {
      return this.probe(path.resolve(config.baseUrl, specifier));
    }

    return undefined;
  }

  private probe(candidate: string): string | undefined {
    const extension = path.extname(candidate);
    if (CODE_EXTENSIONS.includes(extension)) {
      const stem = candidate.slice(0, -extension.length);
      for (const equivalent of TS_EQUIVALENTS[extension] ?? []) {
        if (this.kindOf(stem + equivalent) === "file") {
          return stem + equivalent;
        }
      }
      if (this.kindOf(candidate) === "file") {
        return candidate;
      }
    }

    for (const ext of CODE_EXTENSIONS) {
      if (this.kindOf(candidate + ext) === "file") {
        return candidate + ext;
      }
    }

    if (this.kindOf(candidate) === "dir") {
      for (const ext of CODE_EXTENSIONS) {
        const indexFile = path.join(candidate, `index${ext}`);
        if (this.kindOf(indexFile) === "file") {
          return indexFile;
        }
      }
    }

    return undefined;
  }

  private configFor(dir: string): TsConfigPaths | undefined {
    const configPath = this.findConfigPath(dir);
    if (!configPath) {
      return undefined;
    }
    let config = this.configs.get(configPath);
    if (!config) {
      config = loadTsConfig(configPath);
      this.configs.set(configPath, config);
    }
    return config;
  }

  private findConfigPath(dir: string): string | undefined {
    const visited: string[] = [];
    let current = dir;
    let found: string | null = null;

    for (;;) {
      const cached = this.configPathByDir.get(current);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      visited.push(current);
      const candidate = CONFIG_FILE_NAMES.map((name) =>
        path.join(current, name)
      ).find((file) => this.kindOf(file) === "file");
      if (candidate) {
        found = candidate;
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    for (const visitedDir of visited) {
      this.configPathByDir.set(visitedDir, found);
    }
    return found ?? undefined;
  }

  private kindOf(filePath: string): EntryKind {
    let kind = this.entryKinds.get(filePath);
    if (!kind) {
      try {
        const stat = fs.statSync(filePath);
        kind = stat.isFile() ? "file" : stat.isDirectory() ? "dir" : "missing";
      } catch {
        kind = "missing";
      }
      this.entryKinds.set(filePath, kind);
    }
    return kind;
  }
}
