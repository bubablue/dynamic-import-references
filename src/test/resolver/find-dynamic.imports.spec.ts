import * as vscode from "vscode";
import { getMatchingLocations } from "../../helpers/code/get-matching-locations";
import { extractComponentNames } from "../../helpers/resolver/find-component-name";
import { findDynamicImports } from "../../helpers/resolver/find-dynamic-imports";
import { resolveImportPath } from "../../helpers/resolver/resolve-import-path";
import { resolveAlias } from "../../helpers/ts-config/resolve-alias";

jest.mock("vscode", () => {
  // Keep any properties of vscode you’re not testing. Here, we only need `Uri.file`.
  const originalModule = jest.requireActual("vscode");
  return {
    ...originalModule,
    Uri: {
      file: (filePath: string) => ({ fsPath: filePath }),
    },
  };
});

jest.mock("../../helpers/ts-config/resolve-alias");
jest.mock("../../helpers/code/get-matching-locations");
jest.mock("../../helpers/resolver/find-component-name");
jest.mock("../../helpers/resolver/resolve-import-path");

describe("findDynamicImports", () => {
  // Mocks, cast as jest mock types
  const mockedResolveAlias = resolveAlias as jest.MockedFunction<
    typeof resolveAlias
  >;
  const mockedGetMatchingLocations =
    getMatchingLocations as jest.MockedFunction<typeof getMatchingLocations>;
  const mockedExtractComponentNames =
    extractComponentNames as jest.MockedFunction<typeof extractComponentNames>;
  const mockedResolveImportPath = resolveImportPath as jest.MockedFunction<
    typeof resolveImportPath
  >;

  // Example inputs
  const fileUri = vscode.Uri.file("/path/to/sourceFile.ts");
  const documentPath = "/path/to/sourceFile.ts";
  const word = "SomeWord";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty array if no dynamic/lazy imports are found in text", async () => {
    const text = `// No dynamic or lazy imports here`;
    const result = await findDynamicImports({
      file: fileUri,
      text,
      word,
      documentPath,
      hasAlias: false,
    });
    expect(result).toEqual([]);
    expect(mockedResolveAlias).not.toHaveBeenCalled();
    expect(mockedResolveImportPath).not.toHaveBeenCalled();
    expect(mockedExtractComponentNames).not.toHaveBeenCalled();
    expect(mockedGetMatchingLocations).not.toHaveBeenCalled();
  });

  it("returns an empty array if `extractComponentNames` yields no components", async () => {
    const text = `
      const Something = dynamic(() => import('./NoExports'));
      let Another = lazy(() => import('./NoExports'));
    `;
    // Provide dummy resolved path
    mockedResolveImportPath.mockResolvedValue(["/absolute/path/NoExports.ts"]);
    // Return no component names
    mockedExtractComponentNames.mockResolvedValue([]);

    const result = await findDynamicImports({
      file: fileUri,
      text,
      word,
      documentPath,
      hasAlias: false,
    });

    expect(result).toEqual([]);
    expect(mockedExtractComponentNames).toHaveBeenCalledTimes(2); // for each match
    expect(mockedGetMatchingLocations).not.toHaveBeenCalled(); // no components => no getMatchingLocations calls
  });

  it("calls dependencies and returns flattened locations when matches are found", async () => {
    const text = `
      // There are two dynamic/lazy imports referencing the same file:
      const A = dynamic(() => import('./SomeComponent'));
      const B = lazy(() => import('./SomeComponent'));
    `;
    // Suppose these are the resolved/aliased paths
    mockedResolveImportPath.mockResolvedValue([
      "/absolute/path/SomeComponent.ts",
    ]);
    // Suppose `extractComponentNames` finds 2 named exports
    mockedExtractComponentNames.mockResolvedValue(["CompOne", "CompTwo"]);
    // Suppose each component leads to 1 location
    mockedGetMatchingLocations.mockResolvedValueOnce([
      new vscode.Location(fileUri, new vscode.Position(10, 5)),
    ]);
    mockedGetMatchingLocations.mockResolvedValueOnce([
      new vscode.Location(fileUri, new vscode.Position(11, 3)),
    ]);
    // For the next dynamic import match, we do the same:
    mockedGetMatchingLocations.mockResolvedValueOnce([
      new vscode.Location(fileUri, new vscode.Position(20, 1)),
    ]);
    mockedGetMatchingLocations.mockResolvedValueOnce([
      new vscode.Location(fileUri, new vscode.Position(21, 2)),
    ]);

    const result = await findDynamicImports({
      file: fileUri,
      text,
      word,
      documentPath,
      hasAlias: false,
    });

    /**
     * Explanation of calls:
     *  - We have 2 matches in the text:
     *    1) "dynamic(() => import('./SomeComponent'))"
     *    2) "lazy(() => import('./SomeComponent'))"
     *  - For each match:
     *    a) `resolveImportPath` is called
     *    b) `extractComponentNames` is called
     *    c) For each component name, `getMatchingLocations` is called
     *  - We set 2 componentNames => so each match triggers 2 calls to getMatchingLocations
     */
    expect(mockedResolveImportPath).toHaveBeenCalledTimes(2);
    expect(mockedExtractComponentNames).toHaveBeenCalledTimes(2);
    expect(mockedGetMatchingLocations).toHaveBeenCalledTimes(4);

    // Flatten all returned locations:
    // [
    //   [ (10,5), (11,3) ], // from the first dynamic import
    //   [ (20,1), (21,2) ]  // from the second lazy import
    // ]
    // => [ (10,5), (11,3), (20,1), (21,2) ]
    expect(result).toHaveLength(4);

    // Optionally, verify specific lines or positions:
    expect(result[0]).toEqual({
      position: { char: 5, line: 10 },
      uri: { fsPath: "/path/to/sourceFile.ts" },
    });
    expect(result[1]).toEqual({
      position: { char: 3, line: 11 },
      uri: { fsPath: "/path/to/sourceFile.ts" },
    });
    expect(result[2]).toEqual({
      position: { char: 1, line: 20 },
      uri: { fsPath: "/path/to/sourceFile.ts" },
    });
    expect(result[3]).toEqual({
      position: { char: 2, line: 21 },
      uri: { fsPath: "/path/to/sourceFile.ts" },
    });
  });

  it("resolves aliases if `hasAlias` is true", async () => {
    const text = `const Aliased = dynamic(() => import('@/Components/Aliased'));`;
    mockedResolveAlias.mockReturnValue("/resolved/path/Aliased.ts");
    mockedResolveImportPath.mockResolvedValue(["/absolute/path/Aliased.ts"]);
    mockedExtractComponentNames.mockResolvedValue(["AliasedComp"]);
    mockedGetMatchingLocations.mockResolvedValue([
      new vscode.Location(fileUri, new vscode.Position(5, 10)),
    ]);

    const result = await findDynamicImports({
      file: fileUri,
      text,
      word,
      documentPath,
      hasAlias: true,
      tsConfigDir: "/tsconfigDir",
      aliases: { "@": ["/src"] },
    });

    // Confirm we used resolveAlias
    expect(mockedResolveAlias).toHaveBeenCalledWith(
      "@/Components/Aliased",
      { "@": ["/src"] },
      "/tsconfigDir"
    );
    // And the rest as usual
    expect(mockedResolveImportPath).toHaveBeenCalled();
    expect(mockedExtractComponentNames).toHaveBeenCalled();
    expect(mockedGetMatchingLocations).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});
