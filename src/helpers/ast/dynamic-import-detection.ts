import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { DEFAULT_MATCHERS } from "../../constants";
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
  // Check source match
  if (matcher.source && matcher.source !== importSource) {
    return false;
  }

  // Check name match for named imports
  if (matcher.kind === "named" && matcher.name) {
    if (!matcher.allowAlias && isAliased) {
      return false;
    }
    return importedName === matcher.name;
  }

  // For default imports, any default import from the source matches
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

    // Check if it's aliased - default to false if local is not available (for test compatibility)
    const isAliased =
      importSpecifier.local && t.isIdentifier(importSpecifier.local)
        ? importSpecifier.local.name !== imported.name
        : false; // Default to not aliased if we can't determine

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

  // Check for identifier matchers (local/project utilities)
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
  path: NodePath<t.VariableDeclarator>
): boolean {
  if (!t.isIdentifier(callee)) {
    return false;
  }

  // Check if it's a direct match with built-in names
  if (
    callee.name === "dynamic" ||
    callee.name === "lazy" ||
    callee.name === "loadable"
  ) {
    return true;
  }

  const binding = path.scope.getBinding(callee.name);
  if (binding) {
    return matchesCustomMatcher(binding, callee.name);
  }

  // Check for identifier matchers that don't require imports
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
  path: NodePath<t.VariableDeclarator>
): boolean {
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
    return false;
  }

  const propertyName = callee.property.name;

  // Check built-in property names first
  const isBuiltinProperty = ["lazy", "dynamic", "loadable"].includes(
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

        // Check built-in patterns first
        if (
          isBuiltinProperty &&
          (importSource === "react" ||
            importSource === "next/dynamic" ||
            importSource === "@loadable/component" ||
            importSource.includes("dynamic"))
        ) {
          return true;
        }

        // Check custom matchers for member access patterns
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

          // Back-compat support for memberAccess flag
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

/**
 * Extract import path from arrow function body
 * @param arrowFunc - The arrow function expression to analyze
 * @returns The import path as a string, or null if not found
 */
export function extractImportPathFromArrowFunction(
  arrowFunc: t.ArrowFunctionExpression
): string | null {
  if (!arrowFunc.body) {
    return null;
  }

  let importCall: t.Node = arrowFunc.body;

  if (t.isBlockStatement(importCall) && importCall.body.length > 0) {
    const returnStatement = importCall.body.find((stmt: t.Statement) =>
      t.isReturnStatement(stmt)
    );
    if (
      returnStatement &&
      t.isReturnStatement(returnStatement) &&
      returnStatement.argument
    ) {
      importCall = returnStatement.argument;
    }
  }

  if (!t.isCallExpression(importCall)) {
    return null;
  }

  const hasArguments = importCall.arguments && importCall.arguments.length > 0;

  if (hasArguments) {
    const isImportCall =
      t.isImport(importCall.callee) || // Standard representation
      (t.isIdentifier(importCall.callee) &&
        importCall.callee.name === "import"); // Alternative representation

    if (isImportCall) {
      const importPath = importCall.arguments[0];
      if (t.isStringLiteral(importPath)) {
        return importPath.value;
      }
    }
  }

  return null;
}

/**
 * Extract import path from function expression body
 * @param funcExpr - The function expression to analyze
 * @returns The import path as a string, or null if not found
 */
export function extractImportPathFromFunctionExpression(
  funcExpr: t.FunctionExpression
): string | null {
  if (!funcExpr.body || !t.isBlockStatement(funcExpr.body)) {
    return null;
  }

  const returnStatement = funcExpr.body.body.find((stmt: t.Statement) =>
    t.isReturnStatement(stmt)
  );

  if (
    !returnStatement ||
    !t.isReturnStatement(returnStatement) ||
    !returnStatement.argument
  ) {
    return null;
  }

  const importCall = returnStatement.argument;

  if (!t.isCallExpression(importCall)) {
    return null;
  }

  const hasArguments = importCall.arguments && importCall.arguments.length > 0;

  if (hasArguments) {
    const isImportCall =
      t.isImport(importCall.callee) || // Standard representation
      (t.isIdentifier(importCall.callee) &&
        importCall.callee.name === "import"); // Alternative representation

    if (isImportCall) {
      const importPath = importCall.arguments[0];
      if (t.isStringLiteral(importPath)) {
        return importPath.value;
      }
    }
  }

  return null;
}

/**
 * Helper function to check if import path matches target path
 * @param importPath - The extracted import path
 * @param targetImportPath - The target import path to match against
 * @param resolve - Function to resolve relative paths
 * @param specificComponentName - Optional specific component name to look for
 * @returns True if the import path matches the target path, false otherwise
 */
const checkImportPathMatch = (
  importPath: string,
  targetImportPath: string,
  resolve: (path: string) => string,
  specificComponentName?: string | null
): boolean => {
  const resolvedExtractedPath = resolve(importPath);
  const pathsMatch = resolvedExtractedPath === targetImportPath;

  if (pathsMatch && specificComponentName) {
    // If we're looking for a specific component, we should check if this dynamic import
    // is actually being used to import that specific component
    // This is a more complex analysis that would require looking at how the variable is used
    // For now, we'll use a simple heuristic: if the dynamic import is to the same file,
    // but we're looking for a specific component, we need to be more careful
    // This is where we would need more sophisticated analysis
    // For now, we'll assume the dynamic import is valid if paths match
    return true;
  }

  return pathsMatch;
};

/**
 * Check if a dynamic import's path matches the target import path
 * @param callExpression - The call expression to check
 * @param targetImportPath - The target import path to match against
 * @param resolve - Function to resolve relative paths
 * @param specificComponentName - Optional specific component name to look for
 * @returns True if the dynamic import matches the target path, false otherwise
 */
export function doesDynamicImportMatch(
  callExpression: t.CallExpression,
  targetImportPath: string,
  resolve: (path: string) => string,
  specificComponentName?: string | null
): boolean {
  if (callExpression.arguments.length === 0) {
    return false;
  }

  const firstArg = callExpression.arguments[0];

  if (t.isArrowFunctionExpression(firstArg)) {
    const importPath = extractImportPathFromArrowFunction(firstArg);
    if (importPath) {
      return checkImportPathMatch(
        importPath,
        targetImportPath,
        resolve,
        specificComponentName
      );
    }
  }

  if (t.isFunctionExpression(firstArg) && firstArg.body) {
    const importPath = extractImportPathFromFunctionExpression(firstArg);
    if (importPath) {
      return checkImportPathMatch(
        importPath,
        targetImportPath,
        resolve,
        specificComponentName
      );
    }
  }

  return false;
}

/**
 * Check if an identifier reference should be included
 * @param path - The babel traverse path for the identifier
 * @param dynamicImportBindings - Map of dynamic import bindings
 * @returns True if the identifier reference should be included, false otherwise
 */
export function shouldIncludeIdentifierReference(
  path: NodePath<t.Identifier>,
  dynamicImportBindings: Map<string, Binding>
): boolean {
  const currentBinding = path.scope.getBinding(path.node.name);
  const originalDynamicBinding = dynamicImportBindings.get(path.node.name);

  if (!originalDynamicBinding || currentBinding !== originalDynamicBinding) {
    return false;
  }

  if (
    t.isMemberExpression(path.parent) &&
    path.parent.property === path.node &&
    !path.parent.computed
  ) {
    return false;
  }

  if (
    t.isObjectProperty(path.parent) &&
    path.parent.key === path.node &&
    !path.parent.computed
  ) {
    return false;
  }

  if (currentBinding && currentBinding.identifier === path.node) {
    return false;
  }

  return true;
}
