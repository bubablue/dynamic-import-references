import * as vscode from "vscode";
import { TargetExportInfo } from "../../helpers/ast/analyze-target-exports";
import { parseCodeToAST, traverse } from "../../helpers/ast/ast-utils";
import {
  doesDynamicImportMatch,
  isDirectDynamicImport,
  isMemberExpressionDynamicImport,
} from "../../helpers/ast/dynamic-import-detection";
import { findImportRefNames } from "../../helpers/resolver/find-import-references-names";
import { resolveAlias } from "../../helpers/ts-config/resolve-alias";

jest.mock("vscode", () => {
  // We only need to mock the pieces we actually use:
  // - `workspace.fs.readFile`
  // - `Uri.file(...)` helper to create a URI
  // This also ensures we don't break other parts of the vscode namespace.
  const originalModule = jest.requireActual("vscode");
  return {
    ...originalModule,
    workspace: {
      fs: {
        readFile: jest.fn(),
      },
    },
    Uri: {
      file: (filePath: string) => ({ fsPath: filePath }),
    },
  };
});

jest.mock("../../helpers/ts-config/resolve-alias", () => ({
  resolveAlias: jest.fn(),
}));

jest.mock("../../helpers/ast/ast-utils", () => ({
  parseCodeToAST: jest.fn(),
  traverse: jest.fn(),
}));

jest.mock("../../helpers/ast/dynamic-import-detection", () => ({
  isDirectDynamicImport: jest.fn(),
  isMemberExpressionDynamicImport: jest.fn(),
  doesDynamicImportMatch: jest.fn(),
}));

describe("findImportRefNames", () => {
  const mockedResolveAlias = resolveAlias as jest.MockedFunction<
    typeof resolveAlias
  >;
  const mockedParseCodeToAST = parseCodeToAST as jest.MockedFunction<
    typeof parseCodeToAST
  >;
  const mockedTraverse = traverse as jest.MockedFunction<typeof traverse>;
  const mockedIsDirectDynamicImport =
    isDirectDynamicImport as jest.MockedFunction<typeof isDirectDynamicImport>;
  const mockedIsMemberExpressionDynamicImport =
    isMemberExpressionDynamicImport as jest.MockedFunction<
      typeof isMemberExpressionDynamicImport
    >;
  const mockedDoesDynamicImportMatch =
    doesDynamicImportMatch as jest.MockedFunction<
      typeof doesDynamicImportMatch
    >;

  const testFileUri = vscode.Uri.file("/path/to/file.ts");
  const mockAst = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedParseCodeToAST.mockReturnValue(mockAst);

    mockedIsDirectDynamicImport.mockReturnValue(false);
    mockedIsMemberExpressionDynamicImport.mockReturnValue(false);
    mockedDoesDynamicImportMatch.mockReturnValue(false);

    (global as any).traverseCallCount = 0;
  });

  it("returns empty array if AST traversal encounters an error", async () => {
    // Mock an AST that will cause an error during traversal
    const badAst = null as any;

    const exportInfo: TargetExportInfo = {
      name: "someModule",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: badAst,
    });

    expect(result).toEqual([]);
  });

  it("matches references for default export components", async () => {
    // Mock traverse to simulate finding VariableDeclarator nodes for dynamic imports
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        // Simulate ComponentA = dynamic(() => import('./someModule'))
        const mockPathA = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentA" },
          },
        };

        // Simulate ComponentB = lazy(() => import('./someModule'))
        const mockPathB = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "lazy" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentB" },
          },
        };

        visitor.VariableDeclarator(mockPathA);
        visitor.VariableDeclarator(mockPathB);
      }
    });

    // Mock dynamic import detection to return true for our test cases
    mockedIsDirectDynamicImport.mockReturnValue(true);
    mockedDoesDynamicImportMatch.mockReturnValue(true);

    const exportInfo: TargetExportInfo = {
      name: "SomeComponent",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: mockAst,
    });

    expect(result).toEqual(["ComponentA", "ComponentB"]);
  });

  it("matches references for named export components", async () => {
    // Mock traverse to simulate finding named export references
    let firstCall = true;
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        firstCall &&
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        // First traversal: find dynamic import declarations
        const mockPath = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "moduleRef" },
          },
        };
        visitor.VariableDeclarator(mockPath);
        firstCall = false;
      } else if (
        !firstCall &&
        visitor?.Identifier &&
        typeof visitor.Identifier === "function"
      ) {
        // Second traversal: find direct identifier references
        const mockPath = {
          node: { name: "NamedComponent" },
          parent: { type: "Expression" }, // Not a member expression, variable declarator, etc.
        };
        visitor.Identifier(mockPath);
      }
    });

    // Mock dynamic import detection
    mockedIsDirectDynamicImport.mockReturnValue(true);
    mockedDoesDynamicImportMatch.mockReturnValue(true);

    const exportInfo: TargetExportInfo = {
      name: "NamedComponent",
      isDefault: false,
      isNamed: true,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: mockAst,
    });

    expect(result).toEqual(["NamedComponent"]);
  });

  it("ignores matches whose resolved alias does not match `importedPath`", async () => {
    // Mock traverse to simulate finding aliased dynamic import
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        const mockPath = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "lazy" },
              arguments: [],
            },
            id: { type: "Identifier", name: "AliasedComp" },
          },
        };
        visitor.VariableDeclarator(mockPath);
      }
    });

    // Suppose we have an alias @ -> /src
    mockedResolveAlias.mockImplementation(
      (importPath, _aliases, _tsConfigDir) => {
        // Example: '@/components/AliasedPath' => '/src/components/AliasedPath'
        return importPath.replace("@", "/src");
      }
    );

    // Mock dynamic import detection
    mockedIsDirectDynamicImport.mockReturnValue(true);
    // Return false for doesDynamicImportMatch since the paths don't match
    mockedDoesDynamicImportMatch.mockReturnValue(false);

    const exportInfo: TargetExportInfo = {
      name: "SomeComponent",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      aliases: { "@": ["/src"] },
      tsConfigDir: "/tsconfigDir",
      hasAlias: true,
      exportInfo,
      ast: mockAst,
    });

    expect(result).toEqual([]); // No match because './someModule' != '/src/components/AliasedPath'
    // Note: resolveAlias is called internally by doesDynamicImportMatch
    expect(mockedDoesDynamicImportMatch).toHaveBeenCalled();
  });

  it("returns the matched variable name if alias resolves to the same path", async () => {
    // Mock traverse to simulate finding aliased dynamic import
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        const mockPath = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "AliasedComp" },
          },
        };
        visitor.VariableDeclarator(mockPath);
      }
    });

    // Mock the alias resolution to transform `@/components/AliasedPath` -> `./someModule`
    mockedResolveAlias.mockImplementation((importPath) => {
      // For demonstration, we pretend an alias transforms it to exactly the importedPath we want
      if (importPath === "@/components/AliasedPath") {
        return "./someModule";
      }
      return importPath;
    });

    mockedIsDirectDynamicImport.mockReturnValue(true);
    mockedDoesDynamicImportMatch.mockReturnValue(true);

    const exportInfo: TargetExportInfo = {
      name: "SomeComponent",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      aliases: { "@": ["/src"] },
      tsConfigDir: "/tsconfigDir",
      hasAlias: true,
      exportInfo,
      ast: mockAst,
    });

    // Because the alias resolves '@/components/AliasedPath' to './someModule',
    // the function should return ['AliasedComp'].
    expect(result).toEqual(["AliasedComp"]);
  });

  it("returns empty array if no matching imports are found in file content", async () => {
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        const mockPath1 = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "lazy" },
              arguments: [],
            },
            id: { type: "Identifier", name: "NoMatch1" },
          },
        };
        const mockPath2 = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "NoMatch2" },
          },
        };
        visitor.VariableDeclarator(mockPath1);
        visitor.VariableDeclarator(mockPath2);
      }
    });

    mockedIsDirectDynamicImport.mockReturnValue(true);
    mockedDoesDynamicImportMatch.mockReturnValue(false);

    const exportInfo: TargetExportInfo = {
      name: "SomeComponent",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: mockAst,
    });

    expect(result).toEqual([]);
  });

  it("handles components that are both default and named exports", async () => {
    // Mock traverse to simulate finding dynamic imports
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        const mockPathA = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentA" },
          },
        };
        const mockPathB = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "lazy" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentB" },
          },
        };
        visitor.VariableDeclarator(mockPathA);
        visitor.VariableDeclarator(mockPathB);
      }
    });

    // Mock dynamic import detection
    mockedIsDirectDynamicImport.mockReturnValue(true);
    mockedDoesDynamicImportMatch.mockReturnValue(true);

    const exportInfo: TargetExportInfo = {
      name: "SomeComponent",
      isDefault: true,
      isNamed: true,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: mockAst,
    });

    // For components that are both default and named exports, return the variable names
    expect(result).toEqual(["ComponentA", "ComponentB"]);
  });

  it("excludes default export references that specifically access named exports", async () => {
    // Mock traverse to simulate finding dynamic imports
    mockedTraverse.mockImplementation((ast, visitor: any) => {
      if (
        visitor?.VariableDeclarator &&
        typeof visitor.VariableDeclarator === "function"
      ) {
        // First dynamic import: ComponentA = dynamic(() => import('./someModule'))
        const mockPathA = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "dynamic" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentA" },
          },
        };

        // Second dynamic import: ComponentB = lazy(() => import('./someModule').then(m => m.SpecificNamedExport))
        const mockPathB = {
          node: {
            init: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "lazy" },
              arguments: [],
            },
            id: { type: "Identifier", name: "ComponentB" },
          },
        };

        visitor.VariableDeclarator(mockPathA);
        visitor.VariableDeclarator(mockPathB);
      }
    });

    // Mock dynamic import detection
    mockedIsDirectDynamicImport.mockReturnValue(true);

    // Mock doesDynamicImportMatch to return true for ComponentA but false for ComponentB
    // (ComponentB accesses a specific named export, so it shouldn't match a default export search)
    mockedDoesDynamicImportMatch.mockImplementation(
      (init, importedPath, resolve, componentName) => {
        // For this test, only ComponentA should match (it accesses the default export)
        // ComponentB should not match because it specifically accesses a named export
        return (init as any).callee?.name === "dynamic"; // Only dynamic calls match, not lazy with .then()
      }
    );

    const exportInfo: TargetExportInfo = {
      name: "DefaultComponent",
      isDefault: true,
      isNamed: false,
    };

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
      exportInfo,
      ast: mockAst,
    });

    // ComponentA should be included (default export access)
    // ComponentB should be excluded (accesses specific named export)
    expect(result).toEqual(["ComponentA"]);
  });
});
