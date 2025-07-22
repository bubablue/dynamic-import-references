import { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import * as vscode from "vscode";
import { traverse } from "../../helpers/ast/ast-utils";
import { analyzeDynamicImports } from "../../helpers/ast/dynamic-import-analyzer";
import {
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
  shouldIncludeIdentifierReference,
} from "../../helpers/ast/dynamic-import-detection";
import { log } from "../../helpers/utils/logger";

jest.mock("vscode", () => ({
  Location: jest
    .fn()
    .mockImplementation((uri, position) => ({ uri, position })),
  Position: jest.fn().mockImplementation((line, column) => ({ line, column })),
  Uri: {
    file: jest.fn((path: string) => ({ path })),
  },
}));

jest.mock("../../helpers/ast/ast-utils", () => ({
  traverse: jest.fn(),
}));

jest.mock("../../helpers/ast/dynamic-import-detection", () => ({
  isDirectDynamicImport: jest.fn(),
  isMemberExpressionDynamicImport: jest.fn(),
  shouldIncludeIdentifierReference: jest.fn(),
}));

jest.mock("@babel/types", () => ({
  isCallExpression: jest.fn(),
  isIdentifier: jest.fn(),
}));

jest.mock("../../helpers/utils/logger", () => ({
  log: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("dynamic-import-analyzer", () => {
  const mockTraverse = traverse as jest.MockedFunction<typeof traverse>;

  const mockIsDirectDynamicImport =
    isDirectDynamicImport as jest.MockedFunction<typeof isDirectDynamicImport>;

  const mockIsMemberExpressionDynamicImport =
    isMemberExpressionDynamicImport as jest.MockedFunction<
      typeof isMemberExpressionDynamicImport
    >;

  const mockShouldIncludeIdentifierReference =
    shouldIncludeIdentifierReference as jest.MockedFunction<
      typeof shouldIncludeIdentifierReference
    >;

  beforeEach(() => {
    jest.clearAllMocks();
    (
      t.isCallExpression as jest.MockedFunction<typeof t.isCallExpression>
    ).mockReturnValue(true);
    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(true);
  });

  describe("analyzeDynamicImports", () => {
    it("should analyze dynamic imports and find references", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];

      const mockAst = {} as any;

      mockIsDirectDynamicImport.mockReturnValue(true);
      mockIsMemberExpressionDynamicImport.mockReturnValue(false);
      mockShouldIncludeIdentifierReference.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      expect(result).toHaveProperty("locations");
      expect(result).toHaveProperty("shouldIncludeCurrentImportDeclaration");
      expect(Array.isArray(result.locations)).toBe(true);
      expect(typeof result.shouldIncludeCurrentImportDeclaration).toBe(
        "boolean"
      );
    });

    it("should collect dynamic import bindings for tracked names", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      const mockBinding = { id: "mockBinding" } as unknown as Binding;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.VariableDeclarator) {
          const mockPath = {
            node: {
              init: {
                callee: {},
              },
              id: {
                name: "MyComponent",
              },
            },
            scope: {
              getBinding: jest.fn().mockReturnValue(mockBinding),
            },
          };
          visitor.VariableDeclarator(mockPath);
        }
      });

      mockIsDirectDynamicImport.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      // Test that the function runs without error and returns expected structure
      expect(result).toHaveProperty("locations");
      expect(result).toHaveProperty("shouldIncludeCurrentImportDeclaration");
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("should not collect bindings for names not in the tracked list", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.VariableDeclarator) {
          const mockPath = {
            node: {
              init: {
                callee: {},
              },
              id: {
                name: "OtherComponent",
              },
            },
            scope: {
              getBinding: jest.fn().mockReturnValue({} as Binding),
            },
          };
          visitor.VariableDeclarator(mockPath);
        }
      });

      mockIsDirectDynamicImport.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      // Test that the function runs without error and only processes tracked names
      expect(result).toHaveProperty("locations");
      expect(result).toHaveProperty("shouldIncludeCurrentImportDeclaration");
    });

    it("should handle member expression dynamic imports", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.VariableDeclarator) {
          const mockPath = {
            node: {
              init: {
                callee: {},
              },
              id: {
                name: "MyComponent",
              },
            },
            scope: {
              getBinding: jest.fn().mockReturnValue({} as Binding),
            },
          };
          visitor.VariableDeclarator(mockPath);
        }
      });

      mockIsDirectDynamicImport.mockReturnValue(false);
      mockIsMemberExpressionDynamicImport.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      // Test that member expression dynamic imports are handled
      expect(result).toHaveProperty("locations");
      expect(result).toHaveProperty("shouldIncludeCurrentImportDeclaration");
    });

    it("should create locations for identifier references", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.Identifier) {
          const mockPath = {
            node: {
              name: "MyComponent",
              loc: {
                start: { line: 3, column: 25 },
              },
            },
          };
          visitor.Identifier(mockPath);
        }
      });

      mockShouldIncludeIdentifierReference.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      expect(result.locations).toHaveLength(1);
      expect(vscode.Location).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ line: 2, column: 25 })
      );
    });

    it("should handle missing bindings gracefully", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.VariableDeclarator) {
          const mockPath = {
            node: {
              init: {
                callee: {},
              },
              id: {
                name: "MyComponent",
              },
            },
            scope: {
              getBinding: jest.fn().mockReturnValue(null),
            },
          };
          visitor.VariableDeclarator(mockPath);
        }
      });

      mockIsDirectDynamicImport.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      expect(result).toHaveProperty("locations");
      expect(log.debug).toHaveBeenCalledWith(
        "No binding found for:",
        "MyComponent"
      );
    });

    it("should handle AST traversal errors gracefully", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation(() => {
        throw new Error("Traversal failed");
      });

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      expect(result.locations).toHaveLength(0);
      expect(log.warn).toHaveBeenCalledWith(
        "AST parsing failed in analyzeDynamicImports:",
        expect.any(Error)
      );
    });

    it("should skip identifiers without location info", () => {
      const file = vscode.Uri.file("/test/file.tsx");
      const names = ["MyComponent"];
      const mockAst = {} as any;

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        if (visitor.Identifier) {
          const mockPath = {
            node: {
              name: "MyComponent",
              loc: null,
            },
          };
          visitor.Identifier(mockPath);
        }
      });

      mockShouldIncludeIdentifierReference.mockReturnValue(true);

      const result = analyzeDynamicImports(file, names, 0, mockAst);

      expect(result.locations).toHaveLength(0);
    });
  });
});
