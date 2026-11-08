import { ParseResult } from "@babel/parser";
import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "./ast-utils";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
} from "./dynamic-import-detection";

export interface SourceRange {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export interface ImportSite {
  specifier: string;
  names: string[];
  all: boolean;
  wrapped: boolean;
  anchor: SourceRange;
  usages: SourceRange[];
  nameRanges: Map<string, SourceRange[]>;
}

interface Consumption {
  names: string[];
  all: boolean;
  nameRanges: Map<string, SourceRange[]>;
}

const TRANSPARENT_WRAPPERS = new Set([
  "AwaitExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
]);

const IMPORT_KEYWORD_LENGTH = 6;

function readSpecifier(node: t.Node | undefined): string | undefined {
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function toRange(loc: t.SourceLocation | null | undefined): SourceRange | undefined {
  return loc
    ? {
        line: loc.start.line - 1,
        character: loc.start.column,
        endLine: loc.end.line - 1,
        endCharacter: loc.end.column,
      }
    : undefined;
}

function addName(consumption: Consumption, name: string, node: t.Node): void {
  consumption.names.push(name);
  const range = toRange(node.loc);
  if (range === undefined) {
    return;
  }
  const ranges = consumption.nameRanges.get(name);
  if (ranges === undefined) {
    consumption.nameRanges.set(name, [range]);
  } else {
    ranges.push(range);
  }
}

function addMemberName(
  consumption: Consumption,
  member: t.MemberExpression | t.OptionalMemberExpression
): boolean {
  const property = member.property;
  if (!member.computed && t.isIdentifier(property)) {
    addName(consumption, property.name, property);
    return true;
  }
  if (t.isStringLiteral(property)) {
    addName(consumption, property.value, property);
    return true;
  }
  return false;
}

function addPatternKeys(consumption: Consumption, pattern: t.ObjectPattern): void {
  for (const property of pattern.properties) {
    if (t.isObjectProperty(property) && !property.computed && t.isIdentifier(property.key)) {
      addName(consumption, property.key.name, property.key);
    } else if (t.isObjectProperty(property) && t.isStringLiteral(property.key)) {
      addName(consumption, property.key.value, property.key);
    } else {
      consumption.all = true;
    }
  }
}

function isMemberOf(path: NodePath, object: t.Node): path is NodePath<t.MemberExpression | t.OptionalMemberExpression> {
  return (
    (path.isMemberExpression() || path.isOptionalMemberExpression()) &&
    path.node.object === object
  );
}

function addBindingUsage(consumption: Consumption, scopePath: NodePath, name: string): void {
  const binding = scopePath.scope.getBinding(name);
  if (binding === undefined) {
    consumption.all = true;
    return;
  }
  for (const reference of binding.referencePaths) {
    const parent = reference.parentPath;
    if (parent === null) {
      consumption.all = true;
    } else if (isMemberOf(parent, reference.node)) {
      if (!addMemberName(consumption, parent.node)) {
        consumption.all = true;
      }
    } else if (
      parent.isVariableDeclarator() &&
      parent.node.init === reference.node &&
      t.isObjectPattern(parent.node.id)
    ) {
      addPatternKeys(consumption, parent.node.id);
    } else {
      consumption.all = true;
    }
  }
}

function addCallbackUsage(consumption: Consumption, callback: NodePath | undefined): void {
  if (
    callback === undefined ||
    !(callback.isArrowFunctionExpression() || callback.isFunctionExpression())
  ) {
    consumption.all = true;
    return;
  }
  const param = callback.node.params[0];
  if (t.isObjectPattern(param)) {
    addPatternKeys(consumption, param);
  } else if (t.isIdentifier(param)) {
    addBindingUsage(consumption, callback, param.name);
  } else {
    consumption.all = true;
  }
}

function thenCallOf(path: NodePath): NodePath<t.CallExpression> | undefined {
  const member = path.parentPath;
  if (member === null || !isMemberOf(member, path.node)) {
    return undefined;
  }
  const property = member.node.property;
  const isThen = t.isIdentifier(property) ? !member.node.computed && property.name === "then" : t.isStringLiteral(property, { value: "then" });
  const call = member.parentPath;
  return isThen && call !== null && call.isCallExpression() && call.node.callee === member.node ? call : undefined;
}

function climbTransparent(path: NodePath): NodePath {
  let current = path;
  while (current.parentPath !== null && TRANSPARENT_WRAPPERS.has(current.parentPath.type)) {
    current = current.parentPath;
  }
  return current;
}

function findWrapperCall(path: NodePath): NodePath<t.CallExpression> | undefined {
  const fn = path.getFunctionParent();
  if (fn === null || !(fn.isArrowFunctionExpression() || fn.isFunctionExpression())) {
    return undefined;
  }
  const call = fn.parentPath;
  if (!call.isCallExpression() || !call.node.arguments.includes(fn.node)) {
    return undefined;
  }
  const callee = call.node.callee;
  return isDirectDynamicImport(callee, call) || isMemberExpressionDynamicImport(callee, call) ? call : undefined;
}

function wrapperAnchor(call: NodePath<t.CallExpression>): SourceRange | undefined {
  const callee = call.node.callee;
  return toRange(t.isMemberExpression(callee) ? callee.property.loc : callee.loc);
}

function importKeywordRange(node: t.Node): SourceRange | undefined {
  const start = node.loc?.start;
  return start === undefined
    ? undefined
    : {
        line: start.line - 1,
        character: start.column,
        endLine: start.line - 1,
        endCharacter: start.column + IMPORT_KEYWORD_LENGTH,
      };
}

function wrapperUsages(call: NodePath<t.CallExpression>): SourceRange[] {
  const declarator = climbTransparent(call).parentPath;
  if (declarator === null || !declarator.isVariableDeclarator() || !t.isIdentifier(declarator.node.id)) {
    return [];
  }
  const references = declarator.scope.getBinding(declarator.node.id.name)?.referencePaths;
  if (references === undefined || references.length === 0) {
    return [];
  }
  const usages: SourceRange[] = [];
  for (const reference of references) {
    const range = toRange(reference.node.loc);
    if (range !== undefined) {
      usages.push(range);
    }
  }
  return usages;
}

function consumeFromParent(consumption: Consumption, outer: NodePath): boolean {
  const parent = outer.parentPath;
  if (parent === null) {
    return false;
  }
  if (isMemberOf(parent, outer.node)) {
    if (!addMemberName(consumption, parent.node)) {
      consumption.all = true;
    }
    return true;
  }
  if (parent.isVariableDeclarator() && parent.node.init === outer.node) {
    const id = parent.node.id;
    if (t.isObjectPattern(id)) {
      addPatternKeys(consumption, id);
    } else if (t.isIdentifier(id)) {
      addBindingUsage(consumption, parent, id.name);
    } else {
      consumption.all = true;
    }
    return true;
  }
  return false;
}

function analyzeImportCall(path: NodePath, specifier: string): ImportSite | undefined {
  const consumption: Consumption = { names: [], all: false, nameRanges: new Map() };
  const thenCall = thenCallOf(path);
  if (thenCall !== undefined) {
    addCallbackUsage(consumption, thenCall.get("arguments")[0]);
  }

  const outer = climbTransparent(thenCall ?? path);
  const wrapper = findWrapperCall(outer);
  if (thenCall === undefined && !consumeFromParent(consumption, outer) && wrapper === undefined) {
    consumption.all = true;
  }

  if (wrapper !== undefined && consumption.names.length === 0) {
    consumption.names.push("default");
    consumption.all = false;
  }

  const anchor = wrapper !== undefined ? wrapperAnchor(wrapper) : importKeywordRange(path.node);
  if (anchor === undefined) {
    return undefined;
  }

  return {
    specifier,
    names: consumption.names.length > 1 ? [...new Set(consumption.names)] : consumption.names,
    all: consumption.all,
    wrapped: wrapper !== undefined,
    anchor,
    usages: wrapper !== undefined ? wrapperUsages(wrapper) : [],
    nameRanges: consumption.nameRanges,
  };
}

export function collectImportSites(ast: ParseResult<t.File>): ImportSite[] {
  const sites: ImportSite[] = [];

  traverse(ast, {
    CallExpression(path) {
      if (!t.isImport(path.node.callee)) {
        return;
      }
      const specifier = readSpecifier(path.node.arguments[0]);
      if (specifier === undefined) {
        return;
      }
      const site = analyzeImportCall(path, specifier);
      if (site !== undefined) {
        sites.push(site);
      }
    },
    ImportExpression(path) {
      const specifier = readSpecifier(path.node.source);
      if (specifier === undefined) {
        return;
      }
      const site = analyzeImportCall(path, specifier);
      if (site !== undefined) {
        sites.push(site);
      }
    },
  });

  return sites;
}
