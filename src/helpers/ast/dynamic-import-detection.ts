import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// Check if a direct call is a dynamic/lazy import
export function isDirectDynamicImport(
  callee: t.Node,
  path: NodePath<t.VariableDeclarator>
): boolean {
  if (!t.isIdentifier(callee)) {
    return false;
  }

  // Check for direct calls: dynamic(), lazy()
  if (callee.name === "dynamic" || callee.name === "lazy") {
    return true;
  }

  // Check if it's an aliased import (like 'l' for lazy)
  const binding = path.scope.getBinding(callee.name);
  if (binding?.path?.isImportSpecifier?.()) {
    const importSpecifier = binding.path.node;
    const importDecl = binding.path.parent;

    const imported = importSpecifier.imported;

    const isImportedIdentifier = t.isIdentifier(imported);
    const isLazyOrDynamic =
      isImportedIdentifier &&
      (imported.name === "lazy" || imported.name === "dynamic");
    const hasImportDecl = t.isImportDeclaration(importDecl);
    const hasSource = hasImportDecl && importDecl.source;

    if (isLazyOrDynamic && hasSource) {
      const importSource = importDecl.source.value;
      return (
        importSource === "react" ||
        importSource === "next/dynamic" ||
        importSource.includes("dynamic")
      );
    }
  }

  return false;
}

// Check if a member expression is a dynamic/lazy import
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
    propertyName !== "default"
  ) {
    return false;
  }

  // Check if the object is imported from react or next/dynamic
  if (t.isIdentifier(callee.object)) {
    const objectBinding = path.scope.getBinding(callee.object.name);
    if (objectBinding?.path) {
      const importDecl = objectBinding.path.parent;

      // Break down the complex condition into readable parts
      const isValidImportDecl = t.isImportDeclaration(importDecl);
      const hasSource = isValidImportDecl && importDecl.source;

      if (hasSource) {
        const importSource = importDecl.source.value;
        return (
          importSource === "react" ||
          importSource === "next/dynamic" ||
          importSource.includes("dynamic")
        );
      }
    }
  }

  return false;
}

// Extract import path from arrow function body
export function extractImportPathFromArrowFunction(
  arrowFunc: t.ArrowFunctionExpression
): string | null {
  if (!arrowFunc.body) {
    return null;
  }

  let importCall: t.Node = arrowFunc.body;

  // Handle block statement: () => { return import('...') }
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

  // Check if it's an import() call
  if (!t.isCallExpression(importCall)) {
    return null;
  }

  const hasArguments = importCall.arguments && importCall.arguments.length > 0;

  if (hasArguments) {
    // Check for different representations of dynamic import
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

// Check if a dynamic import's path matches the target import path
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

  // Handle arrow function: () => import('...')
  if (t.isArrowFunctionExpression(firstArg)) {
    const importPath = extractImportPathFromArrowFunction(firstArg);

    if (importPath) {
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
    }
  }

  // Handle function expression: function() { return import('...') }
  if (t.isFunctionExpression(firstArg) && firstArg.body) {
    // Similar logic can be added here if needed
  }

  return false;
}

// Check if an identifier reference should be included
export function shouldIncludeIdentifierReference(
  path: NodePath<t.Identifier>,
  dynamicImportBindings: Map<string, Binding>
): boolean {
  // Only match if this identifier's binding is a dynamic/lazy import binding
  const currentBinding = path.scope.getBinding(path.node.name);
  const originalDynamicBinding = dynamicImportBindings.get(path.node.name);

  if (!originalDynamicBinding || currentBinding !== originalDynamicBinding) {
    return false;
  }

  // Ignore property accesses: obj.prop (where prop is the identifier)
  if (
    t.isMemberExpression(path.parent) &&
    path.parent.property === path.node &&
    !path.parent.computed
  ) {
    return false;
  }

  // Ignore property keys in object literals: { MobileCheckBet: 'value' }
  if (
    t.isObjectProperty(path.parent) &&
    path.parent.key === path.node &&
    !path.parent.computed
  ) {
    return false;
  }

  // Ignore the declaration itself
  if (currentBinding && currentBinding.identifier === path.node) {
    return false;
  }

  return true;
}
