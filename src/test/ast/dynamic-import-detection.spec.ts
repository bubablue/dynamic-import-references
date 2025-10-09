import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
  extractImportPathFromArrowFunction,
  extractImportPathFromFunctionExpression,
  doesDynamicImportMatch,
  shouldIncludeIdentifierReference,
} from "../../helpers/ast/dynamic-import-detection";

const mockCreateIdentifier = (name: string) => ({ type: "Identifier", name });
const mockCreateMemberExpression = (object: any, property: any) => ({
  type: "MemberExpression",
  object,
  property,
});

describe("dynamic-import-detection", () => {
  describe("isDirectDynamicImport", () => {
    it("should return true for direct dynamic import", () => {
      const callee = mockCreateIdentifier("dynamic");
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(null),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for direct lazy import", () => {
      const callee = mockCreateIdentifier("lazy");
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(null),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for direct loadable import", () => {
      const callee = mockCreateIdentifier("loadable");
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(null),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return false for non-identifier callee", () => {
      const callee = { type: "CallExpression" };
      const mockPath = {} as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(false);
    });

    it("should return true for imported lazy from react", () => {
      const callee = mockCreateIdentifier("myLazy");
      const mockBinding = {
        path: {
          isImportSpecifier: jest.fn().mockReturnValue(true),
          node: {
            imported: mockCreateIdentifier("lazy"),
          },
          parent: {
            type: "ImportDeclaration",
            source: { value: "react" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for imported dynamic from next/dynamic", () => {
      const callee = mockCreateIdentifier("myDynamic");
      const mockBinding = {
        path: {
          isImportSpecifier: jest.fn().mockReturnValue(true),
          node: {
            imported: mockCreateIdentifier("dynamic"),
          },
          parent: {
            type: "ImportDeclaration",
            source: { value: "next/dynamic" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for imported lazy from react (aliased)", () => {
      const callee = mockCreateIdentifier("myCustomLazy");
      const mockBinding = {
        path: {
          isImportSpecifier: jest.fn().mockReturnValue(true),
          node: {
            imported: mockCreateIdentifier("lazy"),
            local: mockCreateIdentifier("myCustomLazy"),
          },
          parent: {
            type: "ImportDeclaration",
            source: { value: "react" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for imported loadable from @loadable/component", () => {
      const callee = mockCreateIdentifier("myLoadable");
      const mockBinding = {
        path: {
          isImportSpecifier: jest.fn().mockReturnValue(true),
          node: {
            imported: mockCreateIdentifier("loadable"),
          },
          parent: {
            type: "ImportDeclaration",
            source: { value: "@loadable/component" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return false for non-dynamic/lazy imports", () => {
      const callee = mockCreateIdentifier("myFunc");
      const mockBinding = {
        path: {
          isImportSpecifier: jest.fn().mockReturnValue(true),
          node: {
            imported: mockCreateIdentifier("useState"),
          },
          parent: {
            type: "ImportDeclaration",
            source: { value: "react" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isDirectDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(false);
    });
  });

  describe("isMemberExpressionDynamicImport", () => {
    it("should return true for React.lazy", () => {
      const callee = mockCreateMemberExpression(
        mockCreateIdentifier("React"),
        mockCreateIdentifier("lazy")
      );
      const mockBinding = {
        path: {
          parent: {
            type: "ImportDeclaration",
            source: { value: "react" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for loadable.default from @loadable/component", () => {
      const callee = mockCreateMemberExpression(
        mockCreateIdentifier("loadable"),
        mockCreateIdentifier("default")
      );
      const mockBinding = {
        path: {
          parent: {
            type: "ImportDeclaration",
            source: { value: "@loadable/component" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return true for loadableLib.loadable from @loadable/component", () => {
      const callee = mockCreateMemberExpression(
        mockCreateIdentifier("loadableLib"),
        mockCreateIdentifier("loadable")
      );
      const mockBinding = {
        path: {
          parent: {
            type: "ImportDeclaration",
            source: { value: "@loadable/component" },
          },
        },
      };
      const mockPath = {
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
      } as unknown as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(true);
    });

    it("should return false for non-member expressions", () => {
      const callee = mockCreateIdentifier("dynamic");
      const mockPath = {} as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(false);
    });

    it("should return false for non-dynamic properties", () => {
      const callee = mockCreateMemberExpression(
        mockCreateIdentifier("React"),
        mockCreateIdentifier("useState")
      );
      const mockPath = {} as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(false);
    });

    it("should return false for non-loadable properties", () => {
      const callee = mockCreateMemberExpression(
        mockCreateIdentifier("loadableLib"),
        mockCreateIdentifier("someOtherMethod")
      );
      const mockPath = {} as NodePath<t.VariableDeclarator>;

      const result = isMemberExpressionDynamicImport(callee as t.Node, mockPath);
      expect(result).toBe(false);
    });
  });

  describe("extractImportPathFromArrowFunction", () => {
    it("should extract import path from arrow function with direct return", () => {
      const arrowFunc = {
        body: {
          type: "CallExpression",
          callee: { type: "Import" },
          arguments: [{ type: "StringLiteral", value: "./Component" }],
        },
      } as t.ArrowFunctionExpression;

      const result = extractImportPathFromArrowFunction(arrowFunc);
      expect(result).toBe("./Component");
    });

    it("should extract import path from arrow function with block statement", () => {
      const arrowFunc = {
        body: {
          type: "BlockStatement",
          body: [
            {
              type: "ReturnStatement",
              argument: {
                type: "CallExpression",
                callee: { type: "Import" },
                arguments: [{ type: "StringLiteral", value: "./Component" }],
              },
            },
          ],
        },
      } as t.ArrowFunctionExpression;

      const result = extractImportPathFromArrowFunction(arrowFunc);
      expect(result).toBe("./Component");
    });

    it("should return null for arrow function without body", () => {
      const arrowFunc = {
        body: null,
      } as unknown as t.ArrowFunctionExpression;

      const result = extractImportPathFromArrowFunction(arrowFunc);
      expect(result).toBe(null);
    });

    it("should return null for non-call expression", () => {
      const arrowFunc = {
        body: {
          type: "Identifier",
          name: "something",
        },
      } as t.ArrowFunctionExpression;

      const result = extractImportPathFromArrowFunction(arrowFunc);
      expect(result).toBe(null);
    });
  });

  describe("extractImportPathFromFunctionExpression", () => {
    it("should extract import path from function expression", () => {
      const funcExpr = {
        body: {
          type: "BlockStatement",
          body: [
            {
              type: "ReturnStatement",
              argument: {
                type: "CallExpression",
                callee: { type: "Import" },
                arguments: [{ type: "StringLiteral", value: "./Component" }],
              },
            },
          ],
        },
      } as t.FunctionExpression;

      const result = extractImportPathFromFunctionExpression(funcExpr);
      expect(result).toBe("./Component");
    });

    it("should return null for function without body", () => {
      const funcExpr = {
        body: null,
      } as unknown as t.FunctionExpression;

      const result = extractImportPathFromFunctionExpression(funcExpr);
      expect(result).toBe(null);
    });

    it("should return null for function without return statement", () => {
      const funcExpr = {
        body: {
          type: "BlockStatement",
          body: [
            {
              type: "ExpressionStatement",
              expression: { type: "Identifier", name: "something" },
            },
          ],
        },
      } as t.FunctionExpression;

      const result = extractImportPathFromFunctionExpression(funcExpr);
      expect(result).toBe(null);
    });
  });

  describe("doesDynamicImportMatch", () => {
    const mockResolve = jest.fn((path: string) => `/resolved${path}`);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should return false for call expression without arguments", () => {
      const callExpr = {
        arguments: [],
      } as unknown as t.CallExpression;

      const result = doesDynamicImportMatch(callExpr, "/target/path", mockResolve);
      expect(result).toBe(false);
    });

    it("should return true for matching arrow function import", () => {
      const callExpr = {
        arguments: [
          {
            type: "ArrowFunctionExpression",
            body: {
              type: "CallExpression",
              callee: { type: "Import" },
              arguments: [{ type: "StringLiteral", value: "./Component" }],
            },
          },
        ],
      } as t.CallExpression;

      mockResolve.mockReturnValue("/resolved/Component");

      const result = doesDynamicImportMatch(callExpr, "/resolved/Component", mockResolve);
      expect(result).toBe(true);
    });

    it("should return true for matching function expression import", () => {
      const callExpr = {
        arguments: [
          {
            type: "FunctionExpression",
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ReturnStatement",
                  argument: {
                    type: "CallExpression",
                    callee: { type: "Import" },
                    arguments: [{ type: "StringLiteral", value: "./Component" }],
                  },
                },
              ],
            },
          },
        ],
      } as t.CallExpression;

      mockResolve.mockReturnValue("/resolved/Component");

      const result = doesDynamicImportMatch(callExpr, "/resolved/Component", mockResolve);
      expect(result).toBe(true);
    });

    it("should return false for non-matching import path", () => {
      const callExpr = {
        arguments: [
          {
            type: "ArrowFunctionExpression",
            body: {
              type: "CallExpression",
              callee: { type: "Import" },
              arguments: [{ type: "StringLiteral", value: "./Component" }],
            },
          },
        ],
      } as t.CallExpression;

      mockResolve.mockReturnValue("/resolved/Component");

      const result = doesDynamicImportMatch(callExpr, "/different/path", mockResolve);
      expect(result).toBe(false);
    });

    it("should return true when paths match and specific component is provided", () => {
      const callExpr = {
        arguments: [
          {
            type: "ArrowFunctionExpression",
            body: {
              type: "CallExpression",
              callee: { type: "Import" },
              arguments: [{ type: "StringLiteral", value: "./Component" }],
            },
          },
        ],
      } as t.CallExpression;

      mockResolve.mockReturnValue("/resolved/Component");

      const result = doesDynamicImportMatch(
        callExpr,
        "/resolved/Component",
        mockResolve,
        "MyComponent"
      );
      expect(result).toBe(true);
    });
  });

  describe("shouldIncludeIdentifierReference", () => {
    it("should return true for valid identifier reference", () => {
      const mockBinding = { id: "test" } as unknown as Binding;
      const mockPath = {
        node: { name: "MyComponent" },
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
        parent: { type: "JSXOpeningElement" },
      } as unknown as NodePath<t.Identifier>;

      const dynamicImportBindings = new Map([["MyComponent", mockBinding]]);

      const result = shouldIncludeIdentifierReference(mockPath, dynamicImportBindings);
      expect(result).toBe(true);
    });

    it("should return false for identifier not in bindings", () => {
      const mockPath = {
        node: { name: "MyComponent" },
        scope: {
          getBinding: jest.fn().mockReturnValue(null),
        },
      } as unknown as NodePath<t.Identifier>;

      const dynamicImportBindings = new Map();

      const result = shouldIncludeIdentifierReference(mockPath, dynamicImportBindings);
      expect(result).toBe(false);
    });

    it("should return false for member expression property", () => {
      const mockBinding = { id: "test" } as unknown as Binding;
      const mockNode = { name: "MyComponent" };
      const mockPath = {
        node: mockNode,
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
        parent: {
          type: "MemberExpression",
          property: mockNode,
          computed: false,
        },
      } as unknown as NodePath<t.Identifier>;

      const dynamicImportBindings = new Map([["MyComponent", mockBinding]]);

      const result = shouldIncludeIdentifierReference(mockPath, dynamicImportBindings);
      expect(result).toBe(false);
    });

    it("should return false for object property key", () => {
      const mockBinding = { id: "test" } as unknown as Binding;
      const mockNode = { name: "MyComponent" };
      const mockPath = {
        node: mockNode,
        scope: {
          getBinding: jest.fn().mockReturnValue(mockBinding),
        },
        parent: {
          type: "ObjectProperty",
          key: mockNode,
          computed: false,
        },
      } as unknown as NodePath<t.Identifier>;

      const dynamicImportBindings = new Map([["MyComponent", mockBinding]]);

      const result = shouldIncludeIdentifierReference(mockPath, dynamicImportBindings);
      expect(result).toBe(false);
    });
  });
});
