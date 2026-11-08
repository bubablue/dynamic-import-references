import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { parseCodeToAST } from "../ast/ast-utils";
import { collectImportSites, ImportSite } from "../ast/import-sites";
import { log } from "../utils/logger";

export const SOURCE_GLOB = "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}";
export const EXCLUDED_GLOB = "**/{node_modules,dist,.next}/**";

const EXCLUDED_SEGMENT = /[\\/](?:node_modules|dist|\.next)[\\/]/;
const DYNAMIC_IMPORT_HINT = /\bimport\s*\(/;

export function extractImportSites(text: string): ImportSite[] {
  if (!DYNAMIC_IMPORT_HINT.test(text)) {
    return [];
  }
  try {
    return collectImportSites(parseCodeToAST(text));
  } catch (error) {
    log.debug("Skipping unparsable file", error);
    return [];
  }
}

export class WorkspaceSites {
  private readonly sites = new Map<string, ImportSite[]>();
  private readonly dirty = new Set<string>();
  private initialScan: Promise<void> | undefined;

  async snapshot(): Promise<ReadonlyMap<string, ImportSite[]>> {
    if (this.initialScan === undefined) {
      this.initialScan = this.scanWorkspace();
    }
    await this.initialScan;
    if (this.dirty.size > 0) {
      const paths = [...this.dirty];
      this.dirty.clear();
      await Promise.all(paths.map((fsPath) => this.scanFile(fsPath)));
    }
    return this.sites;
  }

  markChanged(fsPath: string): void {
    if (this.initialScan !== undefined && !EXCLUDED_SEGMENT.test(fsPath)) {
      this.dirty.add(fsPath);
    }
  }

  markDeleted(fsPath: string): void {
    this.dirty.delete(fsPath);
    this.sites.delete(fsPath);
  }

  clear(): void {
    this.sites.clear();
    this.dirty.clear();
    this.initialScan = undefined;
  }

  private async scanWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles(SOURCE_GLOB, EXCLUDED_GLOB);
    await Promise.all(files.map((file) => this.scanFile(file.fsPath)));
  }

  private async scanFile(fsPath: string): Promise<void> {
    let text: string;
    try {
      text = await fs.readFile(fsPath, "utf8");
    } catch {
      this.sites.delete(fsPath);
      return;
    }
    const sites = extractImportSites(text);
    if (sites.length === 0) {
      this.sites.delete(fsPath);
    } else {
      this.sites.set(fsPath, sites);
    }
  }
}
