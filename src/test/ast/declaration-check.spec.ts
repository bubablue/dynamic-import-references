import { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "../../helpers/ast/ast-utils";
import { shouldIncludeDeclaration } from "../../helpers/ast/declaration-check";
import { log } from "../../helpers/utils/logger";

jest.mock("../../helpers/ast/ast-utils", () => ({
  traverse: jest.fn(),
}));

jest.mock("@babel/types", () => ({
  isIdentifier: jest.fn(),
}));

jest.mock("../../helpers/utils/logger", () => ({
  log: {
    warn: jest.fn(),
  },
}));

describe("declaration-check", () => {
  const mockTraverse = traverse as jest.MockedFunction<typeof traverse>;

  beforeEach(() => {
    jest.clearAllMocks();
    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(true);
  });

  describe("shouldIncludeDeclaration", () => {
    it("should return true when declaration is found at the specified line", () => {
      const mockAst = {} as any;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        const mockPath = {
          node: {
            loc: {
              start: { line: 3 },
            },
            id: {
              name: "MyComponent",
            },
          },
        };
        visitor.VariableDeclarator(mockPath);
      });

      const result = shouldIncludeDeclaration(mockAst, 2, mockBindings);
      expect(result).toBe(true);
    });

    it("should return false when declaration is not found at the specified line", () => {
      const mockAst = {} as any;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        const mockPath = {
          node: {
            loc: {
              start: { line: 5 },
            },
            id: {
              name: "MyComponent",
            },
          },
        };
        visitor.VariableDeclarator(mockPath);
      });

      const result = shouldIncludeDeclaration(mockAst, 2, mockBindings);
      expect(result).toBe(false);
    });

    it("should return false when variable name is not in bindings", () => {
      const mockAst = {} as any;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("DifferentComponent", {} as Binding);

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        const mockPath = {
          node: {
            loc: {
              start: { line: 3 },
            },
            id: {
              name: "MyComponent",
            },
          },
        };
        visitor.VariableDeclarator(mockPath);
      });

      const result = shouldIncludeDeclaration(mockAst, 2, mockBindings);
      expect(result).toBe(false);
    });

    it("should return false when no location info is available", () => {
      const mockAst = {} as any;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        const mockPath = {
          node: {
            loc: null,
            id: {
              name: "MyComponent",
            },
          },
        };
        visitor.VariableDeclarator(mockPath);
      });

      const result = shouldIncludeDeclaration(mockAst, 0, mockBindings);
      expect(result).toBe(false);
    });

    it("should return true when multiple declarations are found at the same line", () => {
      const mockAst = {} as any;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);
      mockBindings.set("OtherComponent", {} as Binding);

      mockTraverse.mockImplementation((_ast: any, visitor: any) => {
        const mockPath1 = {
          node: {
            loc: {
              start: { line: 2 },
            },
            id: {
              name: "MyComponent",
            },
          },
        };
        const mockPath2 = {
          node: {
            loc: {
              start: { line: 2 },
            },
            id: {
              name: "OtherComponent",
            },
          },
        };
        visitor.VariableDeclarator(mockPath1);
        visitor.VariableDeclarator(mockPath2);
      });

      const result = shouldIncludeDeclaration(mockAst, 1, mockBindings);
      expect(result).toBe(true);
    });

    it("should fallback to checking bindings size when AST traversal fails", () => {
      const mockAst = {} as any;
      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockTraverse.mockImplementation(() => {
        throw new Error("Traversal failed");
      });

      const result = shouldIncludeDeclaration(mockAst, 0, mockBindings);

      expect(result).toBe(true);
      expect(log.warn).toHaveBeenCalledWith(
        "AST parsing failed while checking declaration location:",
        expect.any(Error)
      );
    });

    it("should return false when AST traversal fails and no bindings exist", () => {
      const mockAst = {} as any;
      const mockBindings = new Map<string, Binding>();

      mockTraverse.mockImplementation(() => {
        throw new Error("Traversal failed");
      });

      const result = shouldIncludeDeclaration(mockAst, 0, mockBindings);

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith(
        "AST parsing failed while checking declaration location:",
        expect.any(Error)
      );
    });
  });
});
