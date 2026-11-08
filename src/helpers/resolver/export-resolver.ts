import { ExportTable } from "../ast/export-table";
import { ModuleResolver } from "./module-resolver";

export interface SymbolKey {
  file: string;
  name: string;
}

export type TableReader = (file: string) => ExportTable | undefined;

const MAX_DEPTH = 12;

export class ExportResolver {
  private readonly memo = new Map<string, SymbolKey | null>();

  constructor(
    private readonly modules: ModuleResolver,
    private readonly readTable: TableReader
  ) {}

  resolveExport(file: string, exportName: string, depth = 0): SymbolKey | undefined {
    const memoKey = `${file}\u0000${exportName}`;
    const memoized = this.memo.get(memoKey);
    if (memoized !== undefined) {
      return memoized ?? undefined;
    }
    this.memo.set(memoKey, null);
    if (depth > MAX_DEPTH) {
      return undefined;
    }
    const result = this.lookup(file, exportName, depth);
    if (result !== undefined) {
      this.memo.set(memoKey, result);
    }
    return result;
  }

  symbolAt(file: string, word: string): SymbolKey | undefined {
    if (word === "default") {
      return this.resolveExport(file, "default");
    }
    const table = this.readTable(file);
    if (table === undefined) {
      return undefined;
    }
    if (table.imports.has(word)) {
      return this.resolveLocal(file, table, word, 0);
    }
    return table.locals.has(word) && table.exportedLocals.has(word) ? { file, name: word } : undefined;
  }

  private lookup(file: string, exportName: string, depth: number): SymbolKey | undefined {
    const table = this.readTable(file);
    if (table === undefined) {
      return undefined;
    }

    if (exportName === "default") {
      if (table.defaultLocal !== undefined) {
        return this.resolveLocal(file, table, table.defaultLocal, depth) ?? { file, name: table.defaultLocal };
      }
      if (table.anonymousDefault) {
        return { file, name: "default" };
      }
    }

    const entry = table.named.get(exportName);
    if (entry !== undefined) {
      return "source" in entry
        ? this.follow(entry.source, entry.imported, file, depth)
        : this.resolveLocal(file, table, entry.local, depth) ?? { file, name: entry.local };
    }

    if (exportName === "default") {
      return undefined;
    }

    for (const source of table.starSources) {
      const target = this.modules.resolve(source, file);
      if (target === undefined) {
        continue;
      }
      const found = this.resolveExport(target, exportName, depth + 1);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  private follow(source: string, imported: string, file: string, depth: number): SymbolKey {
    const target = this.modules.resolve(source, file);
    if (target === undefined) {
      return { file: `external:${source}`, name: imported };
    }
    if (imported === "*") {
      return { file: target, name: "*" };
    }
    return this.resolveExport(target, imported, depth + 1) ?? { file: target, name: imported };
  }

  private resolveLocal(file: string, table: ExportTable, name: string, depth: number): SymbolKey | undefined {
    const binding = table.imports.get(name);
    if (binding !== undefined) {
      return this.follow(binding.source, binding.imported, file, depth);
    }
    return table.locals.has(name) ? { file, name } : undefined;
  }
}
