import * as fs from "fs/promises";
import * as vscode from "vscode";
import { DynamicReferenceProvider } from "../dynamicReferenceProvider";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));

jest.mock("path", () => {
  const actualPath = jest.requireActual("path");
  return {
    ...actualPath,
    resolve: jest
      .fn()
      .mockImplementation((...args) => actualPath.resolve(...args)),
    dirname: jest
      .fn()
      .mockImplementation((...args: [string]) => actualPath.dirname(...args)),
    basename: jest
      .fn()
      .mockImplementation((...args: [string]) => actualPath.basename(...args)),
    extname: jest
      .fn()
      .mockImplementation((...args: [string]) => actualPath.extname(...args)),
  };
});

describe("DynamicReferenceProvider", () => {
  let provider: DynamicReferenceProvider;

  // We'll store a reference to a spy so we can manipulate the return of findFiles per test
  let findFilesSpy: jest.SpiedFunction<typeof vscode.workspace.findFiles>;

  beforeEach(() => {
    provider = new DynamicReferenceProvider();
    jest.clearAllMocks();

    // Suppress console logs so the test output is clean
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    // 3) Spy on workspace.findFiles instead of fully mocking `vscode`
    findFilesSpy = jest.spyOn(vscode.workspace, "findFiles");
    // Default to returning an empty array
    findFilesSpy.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return an empty array if no word range is found", async () => {
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue(null),
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = {
      isCancellationRequested: false,
    } as vscode.CancellationToken;

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );
    expect(result).toEqual([]);
    expect(document.getWordRangeAtPosition).toHaveBeenCalled();
    // findFiles not called because we exit early
    expect(findFilesSpy).not.toHaveBeenCalled();
  });

  it("should handle errors while reading files", async () => {
    const mockWord = "MyComponent";
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn().mockReturnValue(mockWord),
      uri: { fsPath: "/path/to/currentDoc.ts" },
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = {
      isCancellationRequested: false,
    } as vscode.CancellationToken;

    const mockFiles = [{ fsPath: "/path/to/file1.tsx" }] as vscode.Uri[];
    findFilesSpy.mockResolvedValueOnce(mockFiles);

    // The read fails for file1
    (fs.readFile as jest.Mock).mockRejectedValue(new Error("File read error"));

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );
    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it("should stop searching if cancellation token is triggered", async () => {
    const mockWord = "MyComponent";
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn().mockReturnValue(mockWord),
      uri: { fsPath: "/path/to/currentDoc.ts" },
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = { isCancellationRequested: true } as vscode.CancellationToken;

    const mockFiles = [{ fsPath: "/path/to/file1.tsx" }] as vscode.Uri[];
    findFilesSpy.mockResolvedValueOnce(mockFiles);

    // Because the token is canceled, we should not read file1 at all
    (fs.readFile as jest.Mock).mockResolvedValue(
      `const Component = dynamic(() => import("./MyComponent"));`
    );

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );
    expect(result).toEqual([]);
    // Confirm we never even read
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
