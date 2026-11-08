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
const NODE_MODULES_SEGMENT = `${path.sep}node_modules${path.sep}`;
const EXPORT_CONDITIONS = ["source", "development", "import", "module", "browser", "node", "default", "require", "types"];
const ENTRY_FIELDS = ["source", "module", "main"] as const;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const ALIAS_SIGIL = /^[@~$#]+/;

type EntryKind = "file" | "dir" | "missing";

interface PatternMatch<T> {
  value: T;
  captured: string;
}

interface PathsMatch {
  substitutions: string[];
  captured: string;
}

interface PackageJson {
  exports?: unknown;
  imports?: unknown;
  source?: unknown;
  module?: unknown;
  main?: unknown;
}

interface PackageInfo {
  dir: string;
  json: PackageJson;
}

function matchPattern<T>(
  entries: Record<string, T>,
  specifier: string,
  accepts: (value: T) => boolean
): PatternMatch<T> | undefined {
  if (!specifier.includes("*") && Object.prototype.hasOwnProperty.call(entries, specifier)) {
    const exact = entries[specifier];
    if (accepts(exact)) {
      return { value: exact, captured: "" };
    }
  }

  let best: { prefixLength: number; match: PatternMatch<T> } | undefined;
  for (const [pattern, value] of Object.entries(entries)) {
    const star = pattern.indexOf("*");
    if (star === -1 || !accepts(value)) {
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    const fits =
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix);
    if (fits && (best === undefined || prefix.length > best.prefixLength)) {
      best = {
        prefixLength: prefix.length,
        match: { value, captured: specifier.slice(prefix.length, specifier.length - suffix.length) },
      };
    }
  }
  return best?.match;
}

export function matchPathsPattern(
  paths: Record<string, string[]>,
  specifier: string
): PathsMatch | undefined {
  const match = matchPattern(paths, specifier, Array.isArray);
  return match === undefined ? undefined : { substitutions: match.value, captured: match.captured };
}

function conditionTargets(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(conditionTargets);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  const conditions = value as Record<string, unknown>;
  const targets: string[] = [];
  for (const condition of EXPORT_CONDITIONS) {
    if (condition in conditions) {
      targets.push(...conditionTargets(conditions[condition]));
    }
  }
  return targets;
}

function subpathMap(exportsField: unknown): Record<string, unknown> | undefined {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return { ".": exportsField };
  }
  if (exportsField === null || typeof exportsField !== "object") {
    return undefined;
  }
  const keys = Object.keys(exportsField);
  return keys.length > 0 && keys.every((key) => key.startsWith("."))
    ? (exportsField as Record<string, unknown>)
    : { ".": exportsField };
}

function splitPackageName(specifier: string): { name: string; subpath: string } | undefined {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  if (parts.length < nameLength || parts[0] === "" || parts[nameLength - 1] === "") {
    return undefined;
  }
  return { name: parts.slice(0, nameLength).join("/"), subpath: parts.slice(nameLength).join("/") };
}

const acceptsAny = (): boolean => true;

function aliasForms(specifier: string): string[] {
  const segments = specifier.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) {
    return [];
  }
  const forms = [segments.join("/")];
  const bare = segments[0].replace(ALIAS_SIGIL, "");
  if (bare !== segments[0] && bare !== "") {
    forms.push([bare, ...segments.slice(1)].join("/"));
  }
  if (segments.length > 1) {
    forms.push(segments.slice(1).join("/"));
  }
  return forms;
}

function modulePath(file: string): string {
  const stem = file.slice(0, file.length - path.extname(file).length);
  return path.basename(stem) === "index" ? path.dirname(stem) : stem;
}

function moduleTail(form: string): string {
  const extension = path.extname(form);
  const stem = CODE_EXTENSIONS.includes(extension) ? form.slice(0, -extension.length) : form;
  return stem.endsWith("/index") ? stem.slice(0, -"/index".length) : stem;
}

function descendingDirs(root: string, leaf: string): string[] {
  const relative = path.relative(root, leaf);
  const dirs = [root];
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return dirs;
  }
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    dirs.push(current);
  }
  return dirs;
}

export class ModuleResolver {
  private workspaceFileIndex: Map<string, string[]> | undefined;
  private workspaceFilesPending = false;
  private readonly entryKinds = new Map<string, EntryKind>();
  private readonly configPathByDir = new Map<string, string | null>();
  private readonly configs = new Map<string, TsConfigPaths>();
  private readonly resolutions = new Map<string, string | null>();
  private readonly packageByDir = new Map<string, PackageInfo | null>();
  private readonly packageJsons = new Map<string, PackageJson | null>();
  private readonly realpaths = new Map<string, string>();

  constructor(private readonly workspaceFiles: () => ReadonlySet<string> | undefined = () => undefined) {}

  resolve(specifier: string, fromFile: string): string | undefined {
    const fromDir = path.dirname(fromFile);
    const cacheKey = `${fromDir}\u0000${specifier}`;
    const cached = this.resolutions.get(cacheKey);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    this.workspaceFilesPending = false;
    const resolved = this.compute(specifier, fromDir);
    if (resolved !== undefined || !this.workspaceFilesPending) {
      this.resolutions.set(cacheKey, resolved ?? null);
    }
    return resolved;
  }

  invalidateFileSystem(): void {
    this.workspaceFileIndex = undefined;
    this.entryKinds.clear();
    this.realpaths.clear();
    this.configPathByDir.clear();
    this.packageByDir.clear();
    this.resolutions.clear();
  }

  invalidateConfigs(): void {
    this.configs.clear();
    this.packageJsons.clear();
    this.configPathByDir.clear();
    this.packageByDir.clear();
    this.resolutions.clear();
  }

  private compute(specifier: string, fromDir: string): string | undefined {
    if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
      return this.probe(path.resolve(fromDir, specifier));
    }

    if (specifier.includes(":")) {
      return undefined;
    }

    const config = this.configFor(fromDir);
    const match = config?.paths ? matchPathsPattern(config.paths, specifier) : undefined;
    if (match !== undefined) {
      const base = config!.baseUrl ?? config!.pathsBasePath ?? fromDir;
      for (const substitution of match.substitutions) {
        const resolved = this.probe(path.resolve(base, substitution.replace("*", match.captured)));
        if (resolved) {
          return resolved;
        }
      }
    }

    if (specifier.startsWith("#")) {
      const viaImports = this.resolvePackageImport(specifier, fromDir);
      if (viaImports !== undefined) {
        return viaImports;
      }
    }

    if (config?.baseUrl) {
      const viaBaseUrl = this.probe(path.resolve(config.baseUrl, specifier));
      if (viaBaseUrl !== undefined) {
        return viaBaseUrl;
      }
    }

    const parsed = splitPackageName(specifier);
    const packageDir = parsed === undefined ? undefined : this.findPackageDir(parsed.name, fromDir);
    if (packageDir !== undefined) {
      return this.resolvePackageEntry(packageDir, parsed!.subpath);
    }
    return this.resolveUndeclaredAlias(specifier, fromDir);
  }

  private resolveUndeclaredAlias(specifier: string, fromDir: string): string | undefined {
    const forms = aliasForms(specifier);
    if (forms.length === 0) {
      return undefined;
    }
    const root = this.nearestPackage(fromDir)?.dir;
    if (root !== undefined) {
      const dirs = descendingDirs(root, fromDir);
      for (const form of forms) {
        for (const dir of dirs) {
          const resolved = this.probe(path.join(dir, form));
          if (resolved !== undefined) {
            return resolved;
          }
        }
      }
    }
    return this.uniqueWorkspaceMatch(forms);
  }

  private uniqueWorkspaceMatch(forms: string[]): string | undefined {
    const index = this.workspaceIndex();
    if (index === undefined) {
      this.workspaceFilesPending = true;
      return undefined;
    }
    for (const form of forms) {
      const tail = moduleTail(form);
      const candidates = index.get(tail.slice(tail.lastIndexOf("/") + 1));
      if (candidates === undefined) {
        continue;
      }
      const suffix = path.sep + tail.split("/").join(path.sep);
      let match: string | undefined;
      for (const file of candidates) {
        if (!modulePath(file).endsWith(suffix)) {
          continue;
        }
        if (match !== undefined) {
          return undefined;
        }
        match = file;
      }
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  private workspaceIndex(): Map<string, string[]> | undefined {
    if (this.workspaceFileIndex === undefined) {
      const files = this.workspaceFiles();
      if (files === undefined) {
        return undefined;
      }
      const index = new Map<string, string[]>();
      for (const file of files) {
        if (file.includes(NODE_MODULES_SEGMENT)) {
          continue;
        }
        const key = path.basename(modulePath(file));
        const list = index.get(key);
        if (list === undefined) {
          index.set(key, [file]);
        } else {
          list.push(file);
        }
      }
      this.workspaceFileIndex = index;
    }
    return this.workspaceFileIndex;
  }

  private resolvePackageImport(specifier: string, fromDir: string): string | undefined {
    const owner = this.nearestPackage(fromDir);
    const imports = owner?.json.imports;
    if (owner === undefined || imports === null || typeof imports !== "object") {
      return undefined;
    }
    return this.resolveFromMap(owner.dir, imports as Record<string, unknown>, specifier);
  }

  private findPackageDir(name: string, fromDir: string): string | undefined {
    let dir = fromDir;
    for (;;) {
      const candidate = path.join(dir, "node_modules", name);
      if (this.kindOf(candidate) === "dir") {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        return undefined;
      }
      dir = parent;
    }
  }

  private resolvePackageEntry(packageDir: string, subpath: string): string | undefined {
    const realDir = this.realpathOf(packageDir);
    if (realDir.includes(NODE_MODULES_SEGMENT)) {
      return undefined;
    }
    const json = this.packageJson(realDir);
    const exportsMap = json === undefined ? undefined : subpathMap(json.exports);
    if (exportsMap !== undefined) {
      return this.resolveFromMap(realDir, exportsMap, subpath === "" ? "." : `./${subpath}`);
    }
    if (subpath !== "") {
      return this.probe(path.join(realDir, subpath));
    }
    for (const field of ENTRY_FIELDS) {
      const entry = json?.[field];
      if (typeof entry === "string" && !DECLARATION_FILE.test(entry)) {
        const resolved = this.probe(path.resolve(realDir, entry));
        if (resolved !== undefined) {
          return resolved;
        }
      }
    }
    return this.probe(path.join(realDir, "index"));
  }

  private resolveFromMap(baseDir: string, map: Record<string, unknown>, key: string): string | undefined {
    const match = matchPattern(map, key, acceptsAny);
    if (match === undefined) {
      return undefined;
    }
    for (const target of conditionTargets(match.value)) {
      if (DECLARATION_FILE.test(target)) {
        continue;
      }
      const resolved = this.probe(path.resolve(baseDir, target.replace("*", match.captured)));
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }

  private nearestPackage(dir: string): PackageInfo | undefined {
    const visited: string[] = [];
    let current = dir;
    let found: PackageInfo | null = null;
    for (;;) {
      const cached = this.packageByDir.get(current);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      visited.push(current);
      const json = this.packageJson(current);
      if (json !== undefined) {
        found = { dir: current, json };
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    for (const visitedDir of visited) {
      this.packageByDir.set(visitedDir, found);
    }
    return found ?? undefined;
  }

  private packageJson(dir: string): PackageJson | undefined {
    let json = this.packageJsons.get(dir);
    if (json === undefined) {
      json = null;
      const file = path.join(dir, "package.json");
      if (this.kindOf(file) === "file") {
        try {
          const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
          json = parsed !== null && typeof parsed === "object" ? (parsed as PackageJson) : null;
        } catch {
          json = null;
        }
      }
      this.packageJsons.set(dir, json);
    }
    return json ?? undefined;
  }

  private realpathOf(filePath: string): string {
    let real = this.realpaths.get(filePath);
    if (real === undefined) {
      try {
        real = fs.realpathSync.native(filePath);
      } catch {
        real = filePath;
      }
      this.realpaths.set(filePath, real);
    }
    return real;
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
