import { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import * as vscode from "vscode";
import { parseCodeToAST, traverse } from "../ast/ast-utils";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
  shouldIncludeIdentifierReference,
} from "../ast/dynamic-import-detection";
import { log } from "../utils/logger";

export interface DynamicImportAnalysisResult {
  locations: vscode.Location[];
  dynamicImportBindings: Map<string, Binding>;
}

/**
 * Analyzes a file's content to find dynamic import references and their locations
 * First pass: Collect dynamic import variable bindings
 * Second pass: Find identifier references
 * @param fileContent - The content of the file to analyze
 * @param file - The file URI for creating locations
 * @param names - Array of variable names to track (from findImportRefNames)
 * @returns Analysis result with locations and bindings
 */
export function analyzeDynamicImports(
  fileContent: string,
  file: vscode.Uri,
  names: string[]
): DynamicImportAnalysisResult {
  const locations: vscode.Location[] = [];
  const dynamicImportBindings = new Map<string, Binding>();

  try {
    const ast = parseCodeToAST(fileContent);

    traverse(ast, {
      VariableDeclarator(path) {
        const init = path.node.init;
        if (init && t.isCallExpression(init)) {
          const isDynamicImport =
            isDirectDynamicImport(init.callee, path) ||
            isMemberExpressionDynamicImport(init.callee, path);

          if (isDynamicImport && t.isIdentifier(path.node.id)) {
            // Track this dynamic import if its name is in the names list from findImportRefNames
            if (names.includes(path.node.id.name)) {
              const binding = path.scope.getBinding(path.node.id.name);
              if (binding) {
                dynamicImportBindings.set(path.node.id.name, binding);
              } else {
                log.debug("No binding found for:", path.node.id.name);
              }
            }
          }
        }
      },
    });

    traverse(ast, {
      Identifier(path) {
        if (shouldIncludeIdentifierReference(path, dynamicImportBindings)) {
          if (path.node.loc) {
            const { line, column } = path.node.loc.start;
            locations.push(
              new vscode.Location(file, new vscode.Position(line - 1, column))
            );
          }
        }
      },
    });
  } catch (e) {
    log.warn("AST parsing failed in analyzeDynamicImports:", e);
  }

  return {
    locations,
    dynamicImportBindings,
  };
}
