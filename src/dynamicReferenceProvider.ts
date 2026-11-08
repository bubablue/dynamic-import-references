import * as path from "node:path";
import * as vscode from "vscode";
import { ExportTable } from "./helpers/ast/export-table";
import { ImportSite, SourceRange } from "./helpers/ast/import-sites";
import { ExportTables, exportTableFromText } from "./helpers/code/export-tables";
import { WorkspaceSites } from "./helpers/code/workspace-sites";
import { ExportResolver, SymbolKey, TableReader } from "./helpers/resolver/export-resolver";
import { ModuleResolver } from "./helpers/resolver/module-resolver";
import { log } from "./helpers/utils/logger";

const identifierPattern = /[\w$]+/;
const WHOLE_MODULE = "*";

function toLocation(uri: vscode.Uri, range: SourceRange): vscode.Location {
  return new vscode.Location(
    uri,
    new vscode.Range(range.line, range.character, range.endLine, range.endCharacter)
  );
}

function isTarget(symbol: SymbolKey | undefined, target: SymbolKey): boolean {
  return symbol !== undefined && symbol.name === target.name && symbol.file === target.file;
}

export class DynamicReferenceProvider implements vscode.ReferenceProvider {
  private readonly sites = new WorkspaceSites();
  private readonly tables = new ExportTables();
  private readonly modules = new ModuleResolver(() => this.sites.knownFiles());

  fileChanged(fsPath: string): void {
    this.sites.markChanged(fsPath);
    this.tables.delete(fsPath);
  }

  fileCreated(fsPath: string): void {
    this.fileChanged(fsPath);
    this.modules.invalidateFileSystem();
  }

  fileDeleted(fsPath: string): void {
    this.sites.markDeleted(fsPath);
    this.tables.delete(fsPath);
    this.modules.invalidateFileSystem();
  }

  configChanged(): void {
    this.modules.invalidateConfigs();
  }

  clearCache(): void {
    this.sites.clear();
    this.tables.clear();
    this.modules.invalidateConfigs();
    this.modules.invalidateFileSystem();
  }

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position, identifierPattern);
    if (!wordRange) {
      return [];
    }

    try {
      const documentPath = path.normalize(document.uri.fsPath);
      const exports = new ExportResolver(this.modules, this.tableReader(document, documentPath));
      const target = exports.symbolAt(documentPath, document.getText(wordRange));
      if (target === undefined) {
        return [];
      }

      const sitesByFile = await this.sites.snapshot();
      if (token.isCancellationRequested) {
        return [];
      }

      const locations: vscode.Location[] = [];
      for (const [file, sites] of sitesByFile) {
        let uri: vscode.Uri | undefined;
        for (const site of sites) {
          const matched = this.matchedExport(site, file, target, exports);
          if (matched === undefined) {
            continue;
          }
          uri ??= vscode.Uri.file(file);
          this.pushLocations(locations, uri, site, matched);
        }
      }
      return locations;
    } catch (error) {
      log.error("Error in provideReferences:", error);
      return [];
    }
  }

  private tableReader(document: vscode.TextDocument, documentPath: string): TableReader {
    if (!document.isDirty) {
      return (file) => this.tables.get(file);
    }
    let own: ExportTable | null | undefined;
    return (file) => {
      if (file !== documentPath) {
        return this.tables.get(file);
      }
      if (own === undefined) {
        own = exportTableFromText(document.getText()) ?? null;
      }
      return own ?? undefined;
    };
  }

  private matchedExport(
    site: ImportSite,
    importer: string,
    target: SymbolKey,
    exports: ExportResolver
  ): string | undefined {
    const resolved = this.modules.resolve(site.specifier, importer);
    if (resolved === undefined) {
      return undefined;
    }
    for (const name of site.names) {
      if (isTarget(exports.resolveExport(resolved, name), target)) {
        return name;
      }
    }
    if (!site.all) {
      return undefined;
    }
    return resolved === target.file || isTarget(exports.resolveExport(resolved, "default"), target)
      ? WHOLE_MODULE
      : undefined;
  }

  private pushLocations(
    locations: vscode.Location[],
    uri: vscode.Uri,
    site: ImportSite,
    matched: string
  ): void {
    const nameRanges = site.wrapped || matched === "default" ? undefined : site.nameRanges.get(matched);
    if (nameRanges !== undefined) {
      for (const range of nameRanges) {
        locations.push(toLocation(uri, range));
      }
      return;
    }
    locations.push(toLocation(uri, site.anchor));
    for (const range of site.usages) {
      locations.push(toLocation(uri, range));
    }
  }
}
