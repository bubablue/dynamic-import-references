import { ParseResult } from "@babel/parser";
import * as t from "@babel/types";

export interface ModuleBinding {
  source: string;
  imported: string;
}

export interface LocalExport {
  local: string;
}

export interface ExportTable {
  locals: Set<string>;
  exportedLocals: Set<string>;
  imports: Map<string, ModuleBinding>;
  named: Map<string, LocalExport | ModuleBinding>;
  starSources: string[];
  defaultLocal?: string;
  anonymousDefault: boolean;
}

function exportedName(node: t.Identifier | t.StringLiteral): string {
  return t.isIdentifier(node) ? node.name : node.value;
}

function addDeclaredNames(node: t.Node | null | undefined, into: Set<string>, alsoInto?: Set<string>): void {
  if (!node) {
    return;
  }
  if (t.isVariableDeclaration(node)) {
    for (const declarator of node.declarations) {
      if (t.isIdentifier(declarator.id)) {
        into.add(declarator.id.name);
        alsoInto?.add(declarator.id.name);
      }
    }
    return;
  }
  if (
    (t.isFunctionDeclaration(node) ||
      t.isClassDeclaration(node) ||
      t.isTSEnumDeclaration(node) ||
      t.isTSDeclareFunction(node)) &&
    node.id
  ) {
    into.add(node.id.name);
    alsoInto?.add(node.id.name);
  }
}

export function unwrapIdentifier(node: t.Node | null | undefined): t.Identifier | undefined {
  if (!node) {
    return undefined;
  }
  if (t.isIdentifier(node)) {
    return node;
  }
  if (
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isParenthesizedExpression(node)
  ) {
    return unwrapIdentifier(node.expression);
  }
  if (t.isCallExpression(node)) {
    for (const argument of node.arguments) {
      const found = unwrapIdentifier(argument);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function buildExportTable(ast: ParseResult<t.File>): ExportTable {
  const table: ExportTable = {
    locals: new Set(),
    exportedLocals: new Set(),
    imports: new Map(),
    named: new Map(),
    starSources: [],
    anonymousDefault: false,
  };

  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      const source = statement.source.value;
      for (const specifier of statement.specifiers) {
        const imported = t.isImportDefaultSpecifier(specifier)
          ? "default"
          : t.isImportNamespaceSpecifier(specifier)
            ? "*"
            : exportedName(specifier.imported);
        table.imports.set(specifier.local.name, { source, imported });
      }
    } else if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration;
      if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id) {
        table.locals.add(declaration.id.name);
        table.exportedLocals.add(declaration.id.name);
        table.defaultLocal = declaration.id.name;
      } else {
        const identifier = unwrapIdentifier(declaration);
        if (identifier) {
          table.exportedLocals.add(identifier.name);
          table.defaultLocal = identifier.name;
        } else {
          table.anonymousDefault = true;
        }
      }
    } else if (t.isExportNamedDeclaration(statement)) {
      if (statement.declaration) {
        const declared = new Set<string>();
        addDeclaredNames(statement.declaration, declared, table.locals);
        for (const name of declared) {
          table.exportedLocals.add(name);
          table.named.set(name, { local: name });
        }
      }
      const source = statement.source?.value;
      for (const specifier of statement.specifiers) {
        const exported = exportedName(specifier.exported);
        if (t.isExportNamespaceSpecifier(specifier)) {
          if (source !== undefined) {
            table.named.set(exported, { source, imported: "*" });
          }
        } else if (t.isExportSpecifier(specifier)) {
          const local = exportedName(specifier.local);
          if (source !== undefined) {
            table.named.set(exported, { source, imported: local });
          } else {
            table.named.set(exported, { local });
            table.exportedLocals.add(local);
          }
        }
      }
    } else if (t.isExportAllDeclaration(statement)) {
      table.starSources.push(statement.source.value);
    } else {
      addDeclaredNames(statement, table.locals);
    }
  }

  return table;
}
