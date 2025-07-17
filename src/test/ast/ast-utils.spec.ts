import * as babelParser from "@babel/parser";
import { parseCodeToAST, traverse } from "../../helpers/ast/ast-utils";

jest.mock("../../helpers/utils/logger", () => ({
  log: {
    warn: jest.fn(),
  },
}));

describe("ast-utils", () => {
  describe("parseCodeToAST", () => {
    it("should parse valid TypeScript code", () => {
      const code = `
        import React from 'react';
        const MyComponent = () => <div>Hello</div>;
        export default MyComponent;
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse valid JavaScript code", () => {
      const code = `
        const myFunction = () => {
          return "Hello World";
        };
        export default myFunction;
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse JSX code", () => {
      const code = `
        const Component = () => {
          return <div>Hello World</div>;
        };
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse dynamic imports", () => {
      const code = `
        const LazyComponent = lazy(() => import('./MyComponent'));
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse decorators", () => {
      const code = `
        @Component
        class MyClass {
          @property
          myProp: string;
        }
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse optional chaining", () => {
      const code = `
        const value = obj?.prop?.nestedProp;
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should parse nullish coalescing", () => {
      const code = `
        const value = someValue ?? 'default';
      `;

      const ast = parseCodeToAST(code);
      expect(ast).toBeDefined();
      expect(ast.type).toBe("File");
    });

    it("should use fallback parser for problematic code", () => {
      const { log } = require("../../helpers/utils/logger");

      const originalParse = babelParser.parse;
      let callCount = 0;

      jest.spyOn(babelParser, "parse").mockImplementation((text, options) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Primary parsing failed");
        }
        return originalParse(text, options);
      });

      const code = `const simple = 'test';`;
      const ast = parseCodeToAST(code);

      expect(ast).toBeDefined();
      expect(log.warn).toHaveBeenCalledWith(
        "Primary parsing failed, trying fallback:",
        expect.any(Error)
      );

      jest.restoreAllMocks();
    });

    it("should throw error when both primary and fallback parsing fail", () => {
      const { log } = require("../../helpers/utils/logger");

      jest.spyOn(babelParser, "parse").mockImplementation(() => {
        throw new Error("Parsing failed");
      });

      const code = `invalid syntax {{{`;

      expect(() => parseCodeToAST(code)).toThrow("Parsing failed");
      expect(log.warn).toHaveBeenCalledWith(
        "Primary parsing failed, trying fallback:",
        expect.any(Error)
      );
      expect(log.warn).toHaveBeenCalledWith(
        "Fallback parsing failed:",
        expect.any(Error)
      );

      jest.restoreAllMocks();
    });
  });

  describe("traverse export", () => {
    it("should export traverse function from babel", () => {
      expect(traverse).toBeDefined();
      expect(typeof traverse).toBe("function");
    });

    it("should be able to traverse an AST", () => {
      const code = `const myVar = 'test';`;
      const ast = parseCodeToAST(code);

      let identifierCount = 0;
      traverse(ast, {
        Identifier(path) {
          identifierCount++;
        },
      });

      expect(identifierCount).toBeGreaterThan(0);
    });
  });
});
