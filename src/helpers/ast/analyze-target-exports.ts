import * as t from "@babel/types";
import * as vscode from "vscode";
import { log } from "../utils/logger";
import { parseCodeToAST, traverse } from "./ast-utils";

export interface TargetExportInfo {
  name: string;
  isDefault: boolean;
  isNamed: boolean;
}

/**
 * Analyzes a target file to determine the export types for a given search word.
 * Parses the file using AST traversal to identify default and named exports.
 * 
 * @param documentPath - The absolute path to the target file to analyze
 * @param searchWord - The identifier name to search for in the exports
 * @returns Promise that resolves to TargetExportInfo containing export information
 */
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

/**
 * Checks if a variable declaration contains the specified search word.
 * Iterates through variable declarators to find matching identifier names.
 * 
 * @param declaration - The variable declaration node to check
 * @param searchWord - The identifier name to search for
 * @returns True if the search word is found in the variable declaration
 */
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

/**
 * Checks if a function declaration matches the specified search word.
 * Validates that the function has an identifier and its name matches the search word.
 * 
 * @param declaration - The function declaration node to check
 * @param searchWord - The identifier name to search for
 * @returns True if the function declaration name matches the search word
 */
function checkFunctionDeclaration(
  declaration: t.FunctionDeclaration,
  searchWord: string
): boolean {
  return t.isIdentifier(declaration.id) && declaration.id.name === searchWord;
}

/**
 * Checks if any export specifier in the array matches the specified search word.
 * Iterates through export specifiers to find matching exported identifier names.
 * 
 * @param specifiers - Array of export specifiers to check
 * @param searchWord - The identifier name to search for
 * @returns True if any export specifier matches the search word
 */
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

/**
 * Main function to check named export declarations for the specified search word.
 * Handles both direct declarations (variables, functions) and re-exports.
 * 
 * @param node - The export named declaration node to analyze
 * @param searchWord - The identifier name to search for
 * @returns True if the search word is found in the named export declaration
 */
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

  if (node.specifiers) {
    if (
      checkExportSpecifiers(node.specifiers as t.ExportSpecifier[], searchWord)
    ) {
      return true;
    }
  }

  return false;
}
