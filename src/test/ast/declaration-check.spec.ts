import { Binding } from "@babel/traverse";
import { shouldIncludeDeclaration } from "../../helpers/ast/declaration-check";
import { parseCodeToAST, traverse } from "../../helpers/ast/ast-utils";
import * as t from "@babel/types";
import { log } from "../../helpers/utils/logger";

jest.mock("../../helpers/ast/ast-utils", () => ({
  parseCodeToAST: jest.fn(),
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
  const mockParseCodeToAST = parseCodeToAST as jest.MockedFunction<typeof parseCodeToAST>;
  const mockTraverse = traverse as jest.MockedFunction<typeof traverse>;

  beforeEach(() => {
    jest.clearAllMocks();
    (t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>).mockReturnValue(true);
  });

  describe("shouldIncludeDeclaration", () => {
    it("should return true when declaration is found at the specified line", () => {
      const fileContent = `
        import dynamic from 'next/dynamic';
        const MyComponent = dynamic(() => import('./Component'));
        const OtherComponent = () => <div>Other</div>;
      `;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockParseCodeToAST.mockReturnValue({} as any);
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

      const result = shouldIncludeDeclaration(fileContent, 2, mockBindings);
      expect(result).toBe(true);
    });

    it("should return false when declaration is not found at the specified line", () => {
      const fileContent = `
        import dynamic from 'next/dynamic';
        const MyComponent = dynamic(() => import('./Component'));
        const OtherComponent = () => <div>Other</div>;
      `;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockParseCodeToAST.mockReturnValue({} as any);
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

      const result = shouldIncludeDeclaration(fileContent, 2, mockBindings);
      expect(result).toBe(false);
    });

    it("should return false when variable name is not in bindings", () => {
      const fileContent = `
        import dynamic from 'next/dynamic';
        const MyComponent = dynamic(() => import('./Component'));
        const OtherComponent = () => <div>Other</div>;
      `;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("DifferentComponent", {} as Binding);

      mockParseCodeToAST.mockReturnValue({} as any);
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

      const result = shouldIncludeDeclaration(fileContent, 2, mockBindings);
      expect(result).toBe(false);
    });

    it("should return false when no location info is available", () => {
      const fileContent = `
        const MyComponent = dynamic(() => import('./Component'));
      `;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockParseCodeToAST.mockReturnValue({} as any);
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

      const result = shouldIncludeDeclaration(fileContent, 0, mockBindings);
      expect(result).toBe(false);
    });

    it("should return true when multiple declarations are found at the same line", () => {
      const fileContent = `
        const MyComponent = dynamic(() => import('./Component')), OtherComponent = dynamic(() => import('./Other'));
      `;

      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);
      mockBindings.set("OtherComponent", {} as Binding);

      mockParseCodeToAST.mockReturnValue({} as any);
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

      const result = shouldIncludeDeclaration(fileContent, 1, mockBindings);
      expect(result).toBe(true);
    });

    it("should fallback to checking bindings size when AST parsing fails", () => {
      const fileContent = "invalid syntax {{{";
      const mockBindings = new Map<string, Binding>();
      mockBindings.set("MyComponent", {} as Binding);

      mockParseCodeToAST.mockImplementation(() => {
        throw new Error("Parsing failed");
      });

      const result = shouldIncludeDeclaration(fileContent, 0, mockBindings);
      
      expect(result).toBe(true);
      expect(log.warn).toHaveBeenCalledWith(
        "AST parsing failed while checking declaration location:",
        expect.any(Error)
      );
    });

    it("should return false when AST parsing fails and no bindings exist", () => {
      const fileContent = "invalid syntax {{{";
      const mockBindings = new Map<string, Binding>();

      mockParseCodeToAST.mockImplementation(() => {
        throw new Error("Parsing failed");
      });

      const result = shouldIncludeDeclaration(fileContent, 0, mockBindings);
      
      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith(
        "AST parsing failed while checking declaration location:",
        expect.any(Error)
      );
    });
  });
});
