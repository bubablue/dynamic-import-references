import * as vscode from "vscode";
import { findImportRefNames } from "../../helpers/resolver/find-import-references-names";
import { resolveAlias } from "../../helpers/ts-config/resolve-alias";

jest.mock("vscode", () => {
  // We only need to mock the pieces we actually use:
  // - `workspace.fs.readFile`
  // - `Uri.file(...)` helper to create a URI
  // This also ensures we don’t break other parts of the vscode namespace.
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

describe("findImportRefNames", () => {
  const mockedReadFile = vscode.workspace.fs.readFile as jest.MockedFunction<
    typeof vscode.workspace.fs.readFile
  >;
  const mockedResolveAlias = resolveAlias as jest.MockedFunction<
    typeof resolveAlias
  >;

  const testFileUri = vscode.Uri.file("/path/to/file.ts");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array if file read fails", async () => {
    mockedReadFile.mockRejectedValueOnce(new Error("File read error"));

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
    });

    expect(result).toEqual([]);
    expect(mockedReadFile).toHaveBeenCalledWith(testFileUri);
  });

  it("matches references in dynamic/lazy import statements", async () => {
    // This content simulates a few dynamic or lazy imports
    const fileContent = `
      const ComponentA = dynamic(() => import('./someModule'));
      let ComponentB = lazy(() => import('./someModule'));
      var SomethingElse = lazy(() => import('./otherModule'));
      // This one doesn’t match because it’s not dynamic or lazy
      const NotDynamic = () => import('./someModule');
    `;

    // Mock the file read to return this content
    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
    });

    // According to your regex, it should pick up `ComponentA` and `ComponentB` but not `SomethingElse` or `NotDynamic`.
    expect(result).toEqual(["ComponentA", "ComponentB"]);
  });

  it("ignores matches whose resolved alias does not match `importedPath`", async () => {
    const fileContent = `
      const AliasedComp = lazy(() => import('@/components/AliasedPath'));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

    // Suppose we have an alias @ -> /src
    mockedResolveAlias.mockImplementation(
      (importPath, aliases, tsConfigDir) => {
        // Example: '@/components/AliasedPath' => '/src/components/AliasedPath'
        return importPath.replace("@", "/src");
      }
    );

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule", // Our "desired" path
      aliases: { "@": ["/src"] },
      tsConfigDir: "/tsconfigDir",
      hasAlias: true,
    });

    expect(result).toEqual([]); // No match because './someModule' != '/src/components/AliasedPath'
    expect(mockedResolveAlias).toHaveBeenCalledTimes(1);
  });

  it("returns the matched variable name if alias resolves to the same path", async () => {
    const fileContent = `
      let AliasedComp = dynamic(() => import('@/components/AliasedPath'));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

    // Mock the alias resolution to transform `@/components/AliasedPath` -> `./someModule`
    mockedResolveAlias.mockImplementation((importPath) => {
      // For demonstration, we pretend an alias transforms it to exactly the importedPath we want
      if (importPath === "@/components/AliasedPath") {
        return "./someModule";
      }
      return importPath;
    });

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      aliases: { "@": ["/src"] },
      tsConfigDir: "/tsconfigDir",
      hasAlias: true,
    });

    // Because the alias resolves '@/components/AliasedPath' to './someModule',
    // the function should return ['AliasedComp'].
    expect(result).toEqual(["AliasedComp"]);
  });

  it("returns empty array if no matching imports are found in file content", async () => {
    const fileContent = `
      const NoMatch1 = lazy(() => import('./randomModule'));
      const NoMatch2 = dynamic(() => import('./somethingElse'));
    `;
    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

    const result = await findImportRefNames({
      fileUri: testFileUri,
      importedPath: "./someModule",
      hasAlias: false,
    });

    expect(result).toEqual([]);
  });
});
