import * as fs from "fs/promises";
import * as vscode from "vscode";
import { processFile } from "../../helpers/code/process-file";
import { findDynamicImports } from "../../helpers/resolver/find-dynamic-imports";

jest.mock("fs/promises");
jest.mock("../../helpers/resolver/find-dynamic-imports", () => ({
  findDynamicImports: jest.fn(),
}));

describe("processFile", () => {
  const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
  const mockedFindDynamicImports = findDynamicImports as jest.MockedFunction<
    typeof findDynamicImports
  >;

  // We can create a helper for a "fake" vscode.Uri and cancellation token
  function createCancellationToken(
    isCancelled: boolean
  ): vscode.CancellationToken {
    return {
      isCancellationRequested: isCancelled,
      onCancellationRequested: jest.fn(),
    };
  }

  // Example inputs
  const fileUri = { fsPath: "/path/to/file.ts" } as vscode.Uri;
  const documentPath = "/path/to/file.ts";
  const word = "SomeWord";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty array immediately if token is already cancelled", async () => {
    const token = createCancellationToken(true);

    // Try to call processFile
    const result = await processFile({
      file: fileUri,
      word,
      documentPath,
      token,
      hasAlias: false,
    });

    // Because token.isCancellationRequested = true,
    // processFile should return [] without reading or calling findDynamicImports
    expect(result).toEqual([]);
    expect(mockedReadFile).not.toHaveBeenCalled();
    expect(mockedFindDynamicImports).not.toHaveBeenCalled();
  });

  it("returns an empty array if file read fails", async () => {
    const token = createCancellationToken(false);

    // Simulate readFile throwing an error
    mockedReadFile.mockRejectedValueOnce(new Error("File error"));

    const result = await processFile({
      file: fileUri,
      word,
      documentPath,
      token,
      hasAlias: false,
    });

    expect(result).toEqual([]);
    // We tried to read, but it failed
    expect(mockedReadFile).toHaveBeenCalledWith("/path/to/file.ts", "utf8");
    expect(mockedFindDynamicImports).not.toHaveBeenCalled();
  });

  it("calls findDynamicImports with the file contents on success", async () => {
    const token = createCancellationToken(false);
    const fileContent = "fake file content";
    const fakeLocations = [
      new vscode.Location(fileUri, new vscode.Position(10, 5)),
    ];

    // Mock reading file successfully
    mockedReadFile.mockResolvedValueOnce(fileContent);
    // Mock findDynamicImports returning some locations
    mockedFindDynamicImports.mockResolvedValueOnce(fakeLocations);

    const result = await processFile({
      file: fileUri,
      word,
      documentPath,
      token,
      hasAlias: true,
      tsConfigDir: "/tsConfigDir",
      aliases: { "@": ["/src"] },
    });

    expect(mockedReadFile).toHaveBeenCalledWith("/path/to/file.ts", "utf8");
    // Confirm we called findDynamicImports correctly
    expect(mockedFindDynamicImports).toHaveBeenCalledWith({
      file: fileUri,
      text: fileContent,
      word,
      documentPath,
      tsConfigDir: "/tsConfigDir",
      aliases: { "@": ["/src"] },
      hasAlias: true,
    });
    // And we return exactly what findDynamicImports returned
    expect(result).toBe(fakeLocations);
  });

  it("returns an empty array if findDynamicImports resolves to empty array", async () => {
    const token = createCancellationToken(false);
    mockedReadFile.mockResolvedValueOnce("some content");
    mockedFindDynamicImports.mockResolvedValueOnce([]);

    const result = await processFile({
      file: fileUri,
      word,
      documentPath,
      token,
      hasAlias: false,
    });

    // We read the file, called findDynamicImports, but got empty
    expect(mockedReadFile).toHaveBeenCalled();
    expect(mockedFindDynamicImports).toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
