import * as t from "@babel/types";
import * as vscode from "vscode";
import { TargetExportInfo } from "../ast/analyze-target-exports";
import { parseCodeToAST, traverse } from "../ast/ast-utils";
import {
  doesDynamicImportMatch,
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
} from "../ast/dynamic-import-detection";
import { resolveAlias } from "../ts-config/resolve-alias";
import { log } from "../utils/logger";

interface FindImportRefNamesParams {
  fileUri: vscode.Uri;
  importedPath: string;
  aliases?: Record<string, string[]>;
  tsConfigDir?: string;
  hasAlias: boolean;
  exportInfo: TargetExportInfo;
}

// Check if a function argument accesses named exports
function checkFunctionArgumentForNamedExport(arg: t.Node): boolean {
  if (!t.isArrowFunctionExpression(arg) && !t.isFunctionExpression(arg)) {
    return false;
  }

  const body = arg.body;

  // Check if the function returns a member expression accessing a named export
  if (
    t.isMemberExpression(body) &&
    t.isIdentifier(body.property) &&
    body.property.name !== "default"
  ) {
    log.debug("Found named export access:", body.property.name);
    return true;
  }

  // Check if the body is a call expression that might contain the pattern
  if (t.isCallExpression(body)) {
    log.debug("Function body is call expression, checking recursively");
    return checkForNamedExportAccess(body);
  }

  return false;
}

// Check member expression callee for named export access
function checkMemberExpressionCallee(node: t.CallExpression): boolean {
  if (!t.isMemberExpression(node.callee)) {
    return false;
  }

  log.debug("Callee is member expression:", node.callee.property);
  if (t.isCallExpression(node.callee.object)) {
    log.debug("Callee object is call expression, checking recursively");
    return checkForNamedExportAccess(node.callee.object);
  }

  return false;
}

// Recursively check if a call expression accesses named exports
function checkForNamedExportAccess(node: t.CallExpression): boolean {
  // Check all arguments of the current call
  for (const arg of node.arguments) {
    if (checkFunctionArgumentForNamedExport(arg)) {
      return true;
    }
  }

  // If the callee is a member expression, check recursively
  if (checkMemberExpressionCallee(node)) {
    return true;
  }

  log.debug("No named export access found");
  return false;
}

export async function findImportRefNames({
  fileUri,
  importedPath,
  aliases,
  tsConfigDir,
  hasAlias,
  exportInfo,
}: FindImportRefNamesParams): Promise<string[]> {
  try {
    const fileContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(fileUri)
    );

    const resolve = (path: string) =>
      !!aliases && !!tsConfigDir && !!hasAlias
        ? resolveAlias(path, aliases, tsConfigDir)
        : path;

    log.debug("Resolving path:", importedPath);
    log.debug("Looking for export:", exportInfo);

    // If we're looking for a specific component, first check what that component is
    // in the target file (default export vs named export) - this is now provided
    const isDefaultExport = exportInfo.isDefault;
    const isNamedExport = exportInfo.isNamed;
    const componentName = exportInfo.name;

    log.debug("Component is default export:", isDefaultExport);
    log.debug("Component is named export:", isNamedExport);

    const names: string[] = [];

    // AST-based detection for dynamic imports
    const ast = parseCodeToAST(fileContent);

    // Track dynamic import variables and their import paths
    const dynamicImportVars = new Map<string, string>(); // variable name -> import path

    // First pass: find all dynamic import variables
    traverse(ast, {
      VariableDeclarator(path) {
        const init = path.node.init;
        if (init && t.isCallExpression(init) && t.isIdentifier(path.node.id)) {
          const isDynamicImport =
            isDirectDynamicImport(init.callee, path) ||
            isMemberExpressionDynamicImport(init.callee, path);

          if (isDynamicImport) {
            // Check if this dynamic import's path matches the target import path
            const pathMatches = doesDynamicImportMatch(
              init,
              importedPath,
              resolve,
              componentName
            );
            if (pathMatches) {
              log.debug(
                "Found matching dynamic import variable:",
                path.node.id.name
              );
              dynamicImportVars.set(path.node.id.name, importedPath);
            }
          }
        }
      },
    });

    // Second pass: analyze how these dynamic imports are used based on export type
    if (isDefaultExport && !isNamedExport) {
      // For default exports: the dynamic import variable IS the reference to the default export
      // BUT exclude if the dynamic import specifically accesses a named export
      log.debug("Looking for default export references");

      for (const [varName] of dynamicImportVars) {
        // Check if this dynamic import specifically accesses a named export
        let accessesSpecificNamedExport = false;

        // Re-examine the dynamic import declaration to see if it accesses a specific named export
        traverse(ast, {
          VariableDeclarator(path) {
            if (t.isIdentifier(path.node.id) && path.node.id.name === varName) {
              const init = path.node.init;
              if (init && t.isCallExpression(init)) {
                // Check the entire call expression for .then() patterns
                // This handles cases like: lazy(() => import('./module').then(m => m.NamedExport))
                const hasNamedExportAccess = checkForNamedExportAccess(init);
                if (hasNamedExportAccess) {
                  log.debug(
                    "Excluding",
                    varName,
                    "because it accesses a named export"
                  );
                  accessesSpecificNamedExport = true;
                }
              }
            }
          },
        });

        if (!accessesSpecificNamedExport) {
          log.debug("Including default export variable:", varName);
          names.push(varName);
        }
      }
    } else if (isNamedExport && !isDefaultExport) {
      // For named exports: look for property access to the specific named export
      log.debug("Looking for named export references");

      // Add direct references to the component name if they exist
      traverse(ast, {
        Identifier(path) {
          if (
            path.node.name === componentName &&
            !t.isMemberExpression(path.parent) && // Not part of a member expression
            !t.isVariableDeclarator(path.parent) && // Not a variable declaration
            !t.isImportSpecifier(path.parent) && // Not an import
            !t.isExportSpecifier(path.parent)
          ) {
            // Not an export

            log.debug("Found direct reference to named export:", componentName);
            if (!names.includes(componentName)) {
              names.push(componentName);
            }
          }
        },

        MemberExpression(path) {
          // Look for: dynamicImportVar.ComponentName
          if (
            t.isIdentifier(path.node.object) &&
            t.isIdentifier(path.node.property) &&
            path.node.property.name === componentName &&
            dynamicImportVars.has(path.node.object.name)
          ) {
            log.debug(
              "Found named export via member expression:",
              `${path.node.object.name}.${componentName}`
            );

            // For named exports accessed via member expression,
            // we track the component name as the reference target
            if (!names.includes(componentName)) {
              names.push(componentName);
            }
          }
        },
      });
    } else if (isDefaultExport && isNamedExport) {
      // Component is both: include the dynamic import variable
      log.debug("Component is both default and named export");
      for (const [varName] of dynamicImportVars) {
        names.push(varName);
      }
    }

    return names;
  } catch (error) {
    log.error(`Error reading file: ${fileUri.fsPath}`, error);
    return [];
  }
}
