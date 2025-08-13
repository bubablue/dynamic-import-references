import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";

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

  if (callee.name === "dynamic" || callee.name === "lazy" || callee.name === "loadable") {
    return true;
  }

  const binding = path.scope.getBinding(callee.name);
  if (binding?.path?.isImportSpecifier?.()) {
    const importSpecifier = binding.path.node;
    const importDecl = binding.path.parent;

    const imported = importSpecifier.imported;

    const isImportedIdentifier = t.isIdentifier(imported);
    const isLazyOrDynamic =
      isImportedIdentifier &&
      (imported.name === "lazy" || imported.name === "dynamic" || imported.name === "loadable");
    const hasImportDecl = t.isImportDeclaration(importDecl);
    const hasSource = hasImportDecl && importDecl.source;

    if (isLazyOrDynamic && hasSource) {
      const importSource = importDecl.source.value;
      return (
        importSource === "react" ||
        importSource === "next/dynamic" ||
        importSource === "@loadable/component" ||
        importSource.includes("dynamic")
      );
    }
  }

  return false;
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
  if (
    propertyName !== "lazy" &&
    propertyName !== "dynamic" &&
    propertyName !== "loadable" &&
    propertyName !== "default"
  ) {
    return false;
  }

  if (t.isIdentifier(callee.object)) {
    const objectBinding = path.scope.getBinding(callee.object.name);
    if (objectBinding?.path) {
      const importDecl = objectBinding.path.parent;

      const isValidImportDecl = t.isImportDeclaration(importDecl);
      const hasSource = isValidImportDecl && importDecl.source;

      if (hasSource) {
        const importSource = importDecl.source.value;
        return (
          importSource === "react" ||
          importSource === "next/dynamic" ||
          importSource === "@loadable/component" ||
          importSource.includes("dynamic")
        );
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
