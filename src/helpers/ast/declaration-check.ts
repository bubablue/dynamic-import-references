import { ParseResult } from "@babel/parser";
import { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import { log } from "../utils/logger";
import { traverse } from "./ast-utils";

/**
 * Checks if a dynamic import declaration at a specific line should be included in the results
 * Uses AST traversal to find variable declarations that match dynamic import bindings
 * If AST traversal fails, fall back to including if we have any bindings
 * @param ast - The parsed AST of the file to analyze
 * @param currentLine - The line number (0-based) to check
 * @param dynamicImportBindings - Map of dynamic import variable names to their bindings
 * @returns true if the declaration at the current line should be included
 */
export function shouldIncludeDeclaration(
  ast: ParseResult<t.File>,
  currentLine: number,
  dynamicImportBindings: Map<string, Binding>
): boolean {
  try {
    const foundDeclarations: string[] = [];

    traverse(ast, {
      VariableDeclarator(path) {
        if (
          path.node.loc &&
          path.node.loc.start.line - 1 === currentLine &&
          t.isIdentifier(path.node.id) &&
          dynamicImportBindings.has(path.node.id.name)
        ) {
          foundDeclarations.push(path.node.id.name);
        }
      },
    });

    return foundDeclarations.length > 0;
  } catch (e) {
    log.warn("AST parsing failed while checking declaration location:", e);
    return dynamicImportBindings.size > 0;
  }
}
