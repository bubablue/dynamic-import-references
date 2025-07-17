import * as t from "@babel/types";
import * as vscode from "vscode";
import { analyzeTargetFileExports } from "../../helpers/ast/analyze-target-exports";

jest.mock("vscode", () => ({
  Uri: {
    file: jest.fn((path: string) => ({ path })),
  },
  workspace: {
    fs: {
      readFile: jest.fn(),
    },
  },
}));

jest.mock("../../helpers/ast/ast-utils", () => ({
  parseCodeToAST: jest.fn(),
  traverse: jest.fn(),
}));

jest.mock("@babel/types", () => ({
  isIdentifier: jest.fn(),
  isVariableDeclaration: jest.fn(),
  isFunctionDeclaration: jest.fn(),
  isExportSpecifier: jest.fn(),
}));

jest.mock("../../helpers/utils/logger", () => ({
  log: {
    warn: jest.fn(),
  },
}));

import { parseCodeToAST, traverse } from "../../helpers/ast/ast-utils";

describe("analyzeTargetFileExports", () => {
  const mockReadFile = vscode.workspace.fs.readFile as jest.MockedFunction<
    typeof vscode.workspace.fs.readFile
  >;
  const mockParseCodeToAST = parseCodeToAST as jest.MockedFunction<
    typeof parseCodeToAST
  >;
  const mockTraverse = traverse as jest.MockedFunction<typeof traverse>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should analyze default exports correctly", async () => {
    const mockContent = "export default MyComponent;";
    mockReadFile.mockResolvedValue(Buffer.from(mockContent));
    mockParseCodeToAST.mockReturnValue({} as any);

    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(true);

    mockTraverse.mockImplementation((_ast: any, visitor: any) => {
      const mockPath = {
        node: {
          declaration: {
            name: "MyComponent",
          },
        },
      };
      visitor.ExportDefaultDeclaration(mockPath);
    });

    const result = await analyzeTargetFileExports(
      "/test/path.ts",
      "MyComponent"
    );

    expect(result).toEqual({
      name: "MyComponent",
      isDefault: true,
      isNamed: false,
    });
  });

  it("should analyze named exports correctly", async () => {
    const mockContent = "export const MyComponent = () => {};";
    mockReadFile.mockResolvedValue(Buffer.from(mockContent));
    mockParseCodeToAST.mockReturnValue({} as any);

    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(true);
    (
      t.isVariableDeclaration as jest.MockedFunction<
        typeof t.isVariableDeclaration
      >
    ).mockReturnValue(true);

    mockTraverse.mockImplementation((ast: any, visitor: any) => {
      const mockPath = {
        node: {
          declaration: {
            declarations: [
              {
                id: {
                  name: "MyComponent",
                },
              },
            ],
          },
        },
      };
      visitor.ExportNamedDeclaration(mockPath);
    });

    const result = await analyzeTargetFileExports(
      "/test/path.ts",
      "MyComponent"
    );

    expect(result).toEqual({
      name: "MyComponent",
      isDefault: false,
      isNamed: true,
    });
  });

  it("should handle both default and named exports", async () => {
    const mockContent =
      "export default MyComponent; export const MyComponent = () => {};";
    mockReadFile.mockResolvedValue(Buffer.from(mockContent));
    mockParseCodeToAST.mockReturnValue({} as any);

    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(true);
    (
      t.isVariableDeclaration as jest.MockedFunction<
        typeof t.isVariableDeclaration
      >
    ).mockReturnValue(true);

    mockTraverse.mockImplementation((ast: any, visitor: any) => {
      const mockDefaultPath = {
        node: {
          declaration: {
            name: "MyComponent",
          },
        },
      };
      const mockNamedPath = {
        node: {
          declaration: {
            declarations: [
              {
                id: {
                  name: "MyComponent",
                },
              },
            ],
          },
        },
      };
      visitor.ExportDefaultDeclaration(mockDefaultPath);
      visitor.ExportNamedDeclaration(mockNamedPath);
    });

    const result = await analyzeTargetFileExports(
      "/test/path.ts",
      "MyComponent"
    );

    expect(result).toEqual({
      name: "MyComponent",
      isDefault: true,
      isNamed: true,
    });
  });

  it("should handle errors gracefully", async () => {
    mockReadFile.mockRejectedValue(new Error("File not found"));

    const result = await analyzeTargetFileExports(
      "/test/path.ts",
      "MyComponent"
    );

    expect(result).toEqual({
      name: "MyComponent",
      isDefault: false,
      isNamed: false,
    });
  });

  it("should return false for both export types when target is not found", async () => {
    const mockContent = "export const OtherComponent = () => {};";
    mockReadFile.mockResolvedValue(Buffer.from(mockContent));
    mockParseCodeToAST.mockReturnValue({} as any);

    (
      t.isIdentifier as jest.MockedFunction<typeof t.isIdentifier>
    ).mockReturnValue(false);

    const result = await analyzeTargetFileExports(
      "/test/path.ts",
      "MyComponent"
    );

    expect(result).toEqual({
      name: "MyComponent",
      isDefault: false,
      isNamed: false,
    });
  });
});
