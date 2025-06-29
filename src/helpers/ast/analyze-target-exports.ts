import * as t from "@babel/types";
import * as vscode from "vscode";
import { log } from "../utils/logger";
import { parseCodeToAST, traverse } from "./ast-utils";

export interface TargetExportInfo {
  name: string;
  isDefault: boolean;
  isNamed: boolean;
}

export async function analyzeTargetFileExports(
  documentPath: string,
  searchWord: string
): Promise<TargetExportInfo> {
  try {
    const targetFileUri = vscode.Uri.file(documentPath);
    const targetFileContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(targetFileUri)
    );

    const targetAst = parseCodeToAST(targetFileContent);
    const exportTypes = { isDefault: false, isNamed: false };

    traverse(targetAst, {
      ExportDefaultDeclaration(path) {
        if (
          t.isIdentifier(path.node.declaration) &&
          path.node.declaration.name === searchWord
        ) {
          exportTypes.isDefault = true;
        }
      },
      ExportNamedDeclaration(path) {
        if (checkNamedExportDeclaration(path.node, searchWord)) {
          exportTypes.isNamed = true;
        }
      },
    });

    const result = {
      name: searchWord,
      isDefault: exportTypes.isDefault,
      isNamed: exportTypes.isNamed,
    };

    return result;
  } catch (error) {
    log.warn("Could not analyze target file exports:", error);
    return {
      name: searchWord,
      isDefault: false,
      isNamed: false,
    };
  }
}

// Check variable declarations in named exports
function checkVariableDeclaration(
  declaration: t.VariableDeclaration,
  searchWord: string
): boolean {
  for (const declarator of declaration.declarations) {
    if (t.isIdentifier(declarator.id) && declarator.id.name === searchWord) {
      return true;
    }
  }
  return false;
}

// Check function declarations in named exports
function checkFunctionDeclaration(
  declaration: t.FunctionDeclaration,
  searchWord: string
): boolean {
  return t.isIdentifier(declaration.id) && declaration.id.name === searchWord;
}

// Check export specifiers in named exports
function checkExportSpecifiers(
  specifiers: t.ExportSpecifier[],
  searchWord: string
): boolean {
  for (const specifier of specifiers) {
    if (
      t.isExportSpecifier(specifier) &&
      t.isIdentifier(specifier.exported) &&
      specifier.exported.name === searchWord
    ) {
      return true;
    }
  }
  return false;
}

// Main check named export declarations
function checkNamedExportDeclaration(
  node: t.ExportNamedDeclaration,
  searchWord: string
): boolean {
  if (node.declaration) {
    if (t.isVariableDeclaration(node.declaration)) {
      if (checkVariableDeclaration(node.declaration, searchWord)) {
        return true;
      }
    }
    if (t.isFunctionDeclaration(node.declaration)) {
      if (checkFunctionDeclaration(node.declaration, searchWord)) {
        return true;
      }
    }
  }

  // Check re-exports: export { ComponentName }
  if (node.specifiers) {
    if (
      checkExportSpecifiers(node.specifiers as t.ExportSpecifier[], searchWord)
    ) {
      return true;
    }
  }

  return false;
}
