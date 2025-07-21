import * as vscode from "vscode";
import { analyzeTargetFileExports } from "../../helpers/ast/analyze-target-exports";
import { parseCodeToAST } from "../../helpers/ast/ast-utils";
import { analyzeDynamicImports } from "../../helpers/ast/dynamic-import-analyzer";
import { getMatchingLocations } from "../../helpers/code/get-matching-locations";
import { isIncluded } from "../../helpers/fs/is-path-included";
import { findImportRefNames } from "../../helpers/resolver/find-import-references-names";

jest.mock("../../helpers/fs/is-path-included");
jest.mock("../../helpers/resolver/find-import-references-names");
jest.mock("../../helpers/ast/analyze-target-exports");
jest.mock("../../helpers/ast/dynamic-import-analyzer");
jest.mock("../../helpers/ast/ast-utils");

jest.mock("vscode", () => {
  return {
    workspace: {
      fs: {
        readFile: jest.fn(),
      },
    },
    Uri: {
      file: (filePath: string) => ({ fsPath: filePath }),
    },
    Position: jest.fn().mockImplementation((line, character) => ({
      line,
      character,
    })),
    Location: jest.fn().mockImplementation((uri, rangeOrPosition) => {
      const range =
        rangeOrPosition.line !== undefined
          ? { start: rangeOrPosition, end: rangeOrPosition }
          : rangeOrPosition;
      return {
        uri,
        range,
      };
    }),
  };
});

describe("getMatchingLocations", () => {
  const mockedIsIncluded = isIncluded as jest.MockedFunction<typeof isIncluded>;
  const mockedFindImportRefNames = findImportRefNames as jest.MockedFunction<
    typeof findImportRefNames
  >;
  const mockedReadFile = vscode.workspace.fs.readFile as jest.MockedFunction<
    typeof vscode.workspace.fs.readFile
  >;
  const mockedAnalyzeTargetFileExports =
    analyzeTargetFileExports as jest.MockedFunction<
      typeof analyzeTargetFileExports
    >;
  const mockedAnalyzeDynamicImports =
    analyzeDynamicImports as jest.MockedFunction<typeof analyzeDynamicImports>;
  const mockedParseCodeToAST = parseCodeToAST as jest.MockedFunction<
    typeof parseCodeToAST
  >;

  const fileUri = vscode.Uri.file("/path/to/file.ts");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array if neither fileName nor componentName matches `word`", async () => {
    const text = "some text that has no references";
    // For example, file name => "ImportedModule"
    // word => "SomeWord", they won't match
    // componentName => null => won't match
    const result = await getMatchingLocations({
      file: fileUri,
      word: "SomeWord",
      componentName: null,
      documentPath: "/document/path.ts",
      importedPath: "/imported/path/ImportedModule.ts",
      text,
      matchIndex: 0,
      hasAlias: false,
    });

    expect(result).toEqual([]);
    // Check that isIncluded wasn't even called (since no match on name)
    expect(mockedIsIncluded).not.toHaveBeenCalled();
  });

  it("returns empty array if names match but `isIncluded` is false", async () => {
    const text = "some text...";
    mockedIsIncluded.mockReturnValue(false);

    const result = await getMatchingLocations({
      file: fileUri,
      word: "importedmodule", // matches ignoring case
      componentName: null,
      documentPath: "/document/path.ts",
      importedPath: "/imported/path/ImportedModule.ts", // "ImportedModule" => "importedmodule"
      text,
      matchIndex: 0,
      hasAlias: false,
    });

    expect(mockedIsIncluded).toHaveBeenCalledWith(
      "/imported/path/ImportedModule.ts",
      "/document/path.ts"
    );
    expect(result).toEqual([]);
  });

  it("returns a single fallback location if names match and isIncluded=true but no references found", async () => {
    // Suppose we do match, isIncluded => true, but findImportRefNames => []
    mockedIsIncluded.mockReturnValue(true);
    mockedFindImportRefNames.mockResolvedValue([]); // no named references
    mockedAnalyzeTargetFileExports.mockResolvedValue({
      name: "somecomponent",
      isDefault: true,
      isNamed: false,
    });
    mockedParseCodeToAST.mockReturnValue({} as any);
    mockedAnalyzeDynamicImports.mockReturnValue({
      locations: [],
      shouldIncludeCurrentImportDeclaration: true,
    });

    const text = `some dynamic import here...`;
    const matchIndex = 10;

    // Mock the readFile to return the text as a Buffer
    mockedReadFile.mockResolvedValue(Buffer.from(text));

    const result = await getMatchingLocations({
      file: fileUri,
      word: "somecomponent", // matches ignoring case
      componentName: null,
      documentPath: "/document/path.ts",
      importedPath: "/imported/path/SomeComponent.ts",
      text,
      matchIndex,
      hasAlias: false,
    });

    // Because names match, we called isIncluded, findImportRefNames, etc.
    expect(mockedIsIncluded).toHaveBeenCalledWith(
      "/imported/path/SomeComponent.ts",
      "/document/path.ts"
    );
    expect(mockedFindImportRefNames).toHaveBeenCalled();
    expect(mockedAnalyzeTargetFileExports).toHaveBeenCalled();
    expect(mockedAnalyzeDynamicImports).toHaveBeenCalled();
    expect(mockedParseCodeToAST).toHaveBeenCalled();

    // Should have one location from the fallback (shouldIncludeCurrentImportDeclaration returned true)
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      uri: { fsPath: "/path/to/file.ts" },
      range: expect.objectContaining({
        start: expect.objectContaining({
          line: 0,
          character: 10,
        }),
        end: expect.objectContaining({
          line: 0,
          character: 10,
        }),
      }),
    });
  });

  it("returns found reference locations when findImportRefNames returns multiple names", async () => {
    mockedIsIncluded.mockReturnValue(true);
    mockedFindImportRefNames.mockResolvedValue(["CompOne", "CompTwo"]);

    mockedAnalyzeTargetFileExports.mockResolvedValue({
      name: "somecomponent",
      isDefault: true,
      isNamed: false,
    });
    mockedParseCodeToAST.mockReturnValue({} as any);

    // We'll pretend we find these references in the text at indexes 15 and 30 for "CompOne",
    // and indexes 50 and 75 for "CompTwo".
    const text = `
      const a = CompOne();
      const b = Another();
      CompOne();
      CompTwo();
      ...
      CompTwo();
    `;

    // Mock the readFile to return the text as a Buffer
    mockedReadFile.mockResolvedValue(Buffer.from(text));

    // Mock analyze dynamic imports to return the 4 locations
    const mockLocations = [
      new vscode.Location(fileUri, new vscode.Position(1, 10)),
      new vscode.Location(fileUri, new vscode.Position(3, 2)),
      new vscode.Location(fileUri, new vscode.Position(4, 0)),
      new vscode.Location(fileUri, new vscode.Position(6, 5)),
    ];

    mockedAnalyzeDynamicImports.mockReturnValue({
      locations: mockLocations,
      shouldIncludeCurrentImportDeclaration: false,
    });

    const result = await getMatchingLocations({
      file: fileUri,
      word: "somecomponent", // matches ignoring case
      componentName: null,
      documentPath: "/document/path.ts",
      importedPath: "/imported/path/SomeComponent.ts",
      text,
      matchIndex: 0,
      hasAlias: false,
    });

    // We have 4 matches total from "CompOne" and "CompTwo"
    expect(result).toHaveLength(4);

    // Check that the locations match what we mocked
    expect(result[0]).toEqual(mockLocations[0]);
    expect(result[1]).toEqual(mockLocations[1]);
    expect(result[2]).toEqual(mockLocations[2]);
    expect(result[3]).toEqual(mockLocations[3]);
  });
});
