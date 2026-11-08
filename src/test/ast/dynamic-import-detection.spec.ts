import { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
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
});
