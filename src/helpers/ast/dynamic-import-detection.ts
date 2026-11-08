import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { DEFAULT_FUNCTION_NAMES, DEFAULT_MATCHERS } from "../../constants";
import { CustomMatcher } from "../../types/customMatchers";

let customMatchers: CustomMatcher[] = [];

/**
 * Set custom matchers configuration
 * @param matchers - Array of custom matcher configurations
 */
export function setCustomMatchers(matchers: CustomMatcher[]): void {
  customMatchers = matchers;
}

/**
 * Get all matchers (built-in + custom)
 * @returns Combined array of all matchers
 */
function getAllMatchers(): CustomMatcher[] {
  return [...DEFAULT_MATCHERS, ...customMatchers];
}

/**
 * Check if an import matches any of the configured matchers
 * @param importedName - The imported identifier name
 * @param importSource - The module specifier
 * @param matcher - The matcher configuration
 * @param isAliased - Whether the import is aliased
 * @returns True if the import matches the matcher
 */
function matchesImport(
  importedName: string,
  importSource: string,
  matcher: CustomMatcher,
  isAliased: boolean = false
): boolean {
  if (matcher.source && matcher.source !== importSource) {
    return false;
  }

  if (matcher.kind === "named" && matcher.name) {
    if (!matcher.allowAlias && isAliased) {
      return false;
    }
    return importedName === matcher.name;
  }

  if (matcher.kind === "default") {
    return true;
  }

  return false;
}

/**
 * Check if a binding matches any custom matcher
 * @param binding - The babel binding to check
 * @param calleeName - The name being called
 * @returns True if the binding matches a custom matcher
 */
function matchesCustomMatcher(binding: Binding, calleeName: string): boolean {
  const matchers = getAllMatchers();

  if (binding.path?.isImportSpecifier?.()) {
    const importSpecifier = binding.path.node;
    const importDecl = binding.path.parent;

    if (!t.isImportDeclaration(importDecl) || !importDecl.source) {
      return false;
    }

    const importSource = importDecl.source.value;
    const imported = importSpecifier.imported;

    if (!t.isIdentifier(imported)) {
      return false;
    }

    const isAliased =
      importSpecifier.local && t.isIdentifier(importSpecifier.local)
        ? importSpecifier.local.name !== imported.name
        : false;

    return matchers.some((matcher) =>
      matchesImport(imported.name, importSource, matcher, isAliased)
    );
  }

  if (binding.path?.isImportDefaultSpecifier?.()) {
    const importDecl = binding.path.parent;

    if (!t.isImportDeclaration(importDecl) || !importDecl.source) {
      return false;
    }

    const importSource = importDecl.source.value;

    return matchers.some(
      (matcher) => matcher.kind === "default" && matcher.source === importSource
    );
  }

  if (binding.path?.isImportNamespaceSpecifier?.()) {
    const importDecl = binding.path.parent;

    if (!t.isImportDeclaration(importDecl) || !importDecl.source) {
      return false;
    }

    const importSource = importDecl.source.value;

    return matchers.some(
      (matcher) =>
        matcher.kind === "member" &&
        matcher.source === importSource &&
        matcher.namespace === binding.identifier.name
    );
  }

  return matchers.some(
    (matcher) =>
      matcher.kind === "identifier" &&
      matcher.name === calleeName &&
      (!matcher.requireImport ||
        binding.path?.isImportSpecifier?.() ||
        binding.path?.isImportDefaultSpecifier?.())
  );
}

/**
 * Check if a direct call is a dynamic/lazy import
 * @param callee - The AST node representing the callee expression
 * @param path - The babel traverse path for the variable declarator
 * @returns True if the callee is a dynamic/lazy import, false otherwise
 */
export function isDirectDynamicImport(
  callee: t.Node,
  path: NodePath
): boolean {
  if (!t.isIdentifier(callee)) {
    return false;
  }

  if (callee.name && DEFAULT_FUNCTION_NAMES.includes(callee.name)) {
    return true;
  }

  const binding = path.scope.getBinding(callee.name);
  if (binding) {
    return matchesCustomMatcher(binding, callee.name);
  }

  const matchers = getAllMatchers();
  return matchers.some(
    (matcher: CustomMatcher) =>
      matcher.kind === "identifier" &&
      matcher.name === callee.name &&
      !matcher.requireImport
  );
}

/**
 * Check if a member expression is a dynamic/lazy import
 * @param callee - The AST node representing the callee expression
 * @param path - The babel traverse path for the variable declarator
 * @returns True if the member expression is a dynamic/lazy import, false otherwise
 */
export function isMemberExpressionDynamicImport(
  callee: t.Node,
  path: NodePath
): boolean {
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
    return false;
  }

  const propertyName = callee.property.name;
  const isBuiltinProperty = [...DEFAULT_FUNCTION_NAMES, "default"].includes(
    propertyName
  );

  if (t.isIdentifier(callee.object)) {
    const objectBinding = path.scope?.getBinding?.(callee.object.name);
    if (objectBinding?.path) {
      const importDecl = objectBinding.path.parent;

      const isValidImportDecl = t.isImportDeclaration(importDecl);
      const hasSource = isValidImportDecl && importDecl.source;

      if (hasSource) {
        const importSource = importDecl.source.value;

        if (
          isBuiltinProperty &&
          (importSource === "react" ||
            importSource === "next/dynamic" ||
            importSource === "@loadable/component" ||
            importSource.includes("dynamic"))
        ) {
          return true;
        }

        const matchers = getAllMatchers();
        return matchers.some((matcher: CustomMatcher) => {
          if (matcher.kind === "member" && matcher.source === importSource) {
            if (
              matcher.namespace &&
              t.isIdentifier(callee.object) &&
              matcher.namespace === callee.object.name
            ) {
              return matcher.member === propertyName;
            }
          }

          if (matcher.memberAccess && matcher.source === importSource) {
            return matcher.name === propertyName;
          }

          return false;
        });
      }
    }
  }

  return false;
}
