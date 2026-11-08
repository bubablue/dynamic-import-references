import * as fs from "node:fs";
import { parseCodeToAST } from "../ast/ast-utils";
import { buildExportTable, ExportTable } from "../ast/export-table";

export function exportTableFromText(text: string): ExportTable | undefined {
  try {
    return buildExportTable(parseCodeToAST(text));
  } catch {
    return undefined;
  }
}

export class ExportTables {
  private readonly tables = new Map<string, ExportTable | null>();

  get(file: string): ExportTable | undefined {
    let table = this.tables.get(file);
    if (table === undefined) {
      let text: string | undefined;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        text = undefined;
      }
      table = (text === undefined ? undefined : exportTableFromText(text)) ?? null;
      this.tables.set(file, table);
    }
    return table ?? undefined;
  }

  delete(file: string): void {
    this.tables.delete(file);
  }

  clear(): void {
    this.tables.clear();
  }
}
