import { ParseResult } from "@babel/parser";
import { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import * as vscode from "vscode";
import { traverse } from "../ast/ast-utils";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
  shouldIncludeIdentifierReference,
} from "../ast/dynamic-import-detection";
import { log } from "../utils/logger";
import { shouldIncludeDeclaration } from "./declaration-check";

export interface DynamicImportAnalysisResult {
  locations: vscode.Location[];
  shouldIncludeCurrentImportDeclaration: boolean;
}

/**
 * Analyzes a file's AST to find dynamic import references and their locations
 * First pass: Collect dynamic import variable bindings from variable declarations
 * Second pass: Find identifier references that match the tracked bindings
 * @param file - The file URI for creating locations
 * @param names - Array of variable names to track (from findImportRefNames)
 * @param currentLine - The line number (0-based) to check for current import declaration
 * @param ast - The parsed AST of the file to analyze
 * @returns Analysis result with locations and bindings
 */
export function analyzeDynamicImports(
  file: vscode.Uri,
  names: string[],
  currentLine: number,
  ast: ParseResult<t.File>
): DynamicImportAnalysisResult {
  const locations: vscode.Location[] = [];
  const dynamicImportBindings = new Map<string, Binding>();

  try {
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

  const shouldIncludeCurrentImportDeclaration = shouldIncludeDeclaration(
    ast,
    currentLine,
    dynamicImportBindings
  );

  return {
    locations,
    shouldIncludeCurrentImportDeclaration,
  };
}
