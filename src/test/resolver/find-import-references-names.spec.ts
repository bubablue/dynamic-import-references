import * as vscode from "vscode";
import { findImportRefNames } from "../../helpers/resolver/find-import-references-names";
import { resolveAlias } from "../../helpers/ts-config/resolve-alias";
import { TargetExportInfo } from "../../helpers/ast/analyze-target-exports";

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
    });

    expect(result).toEqual([]);
    expect(mockedReadFile).toHaveBeenCalledWith(testFileUri);
  });

  it("matches references for default export components", async () => {
    const fileContent = `
      const ComponentA = dynamic(() => import('./someModule'));
      let ComponentB = lazy(() => import('./someModule'));
      var SomethingElse = lazy(() => import('./otherModule'));
      // This one doesn't match because it's not dynamic or lazy
      const NotDynamic = () => import('./someModule');
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

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
    });

    expect(result).toEqual(["ComponentA", "ComponentB"]);
  });

  it("matches references for named export components", async () => {
    const fileContent = `
      const moduleRef = dynamic(() => import('./someModule'));
      const ComponentA = moduleRef.NamedComponent;
      let ComponentB = lazy(() => import('./someModule').then(m => m.NamedComponent));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

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
    });

    expect(result).toEqual(["NamedComponent"]);
  });

  it("ignores matches whose resolved alias does not match `importedPath`", async () => {
    const fileContent = `
      const AliasedComp = lazy(() => import('@/components/AliasedPath'));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

    // Suppose we have an alias @ -> /src
    mockedResolveAlias.mockImplementation(
      (importPath, _aliases, _tsConfigDir) => {
        // Example: '@/components/AliasedPath' => '/src/components/AliasedPath'
        return importPath.replace("@", "/src");
      }
    );

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
    });

    expect(result).toEqual([]);
  });

  it("handles components that are both default and named exports", async () => {
    const fileContent = `
      const ComponentA = dynamic(() => import('./someModule'));
      const ComponentB = lazy(() => import('./someModule'));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

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
    });

    // For components that are both default and named exports, return the variable names
    expect(result).toEqual(["ComponentA", "ComponentB"]);
  });

  it("excludes default export references that specifically access named exports", async () => {
    const fileContent = `
      const ComponentA = dynamic(() => import('./someModule'));
      const ComponentB = lazy(() => import('./someModule').then(m => m.SpecificNamedExport));
    `;

    mockedReadFile.mockResolvedValueOnce(Buffer.from(fileContent));

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
    });

    // ComponentA should be included (default export access)
    // ComponentB should be excluded (accesses specific named export)
    expect(result).toEqual(["ComponentA"]);
  });
});
