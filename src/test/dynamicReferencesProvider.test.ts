import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { DynamicReferenceProvider } from "../dynamicReferenceProvider";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));

jest.mock("path", () => ({
  ...jest.requireActual("path"),
  resolve: jest.fn(),
  dirname: jest.fn(),
  basename: jest.fn(),
  extname: jest.fn(),
}));

jest.mock("vscode", () => ({
  ...jest.requireActual("vscode"),
  workspace: {
    findFiles: jest.fn(),
  },
  Location: jest.fn(),
  Position: jest.fn(),
}));

describe("DynamicReferenceProvider", () => {
  let provider: DynamicReferenceProvider;

  beforeEach(() => {
    provider = new DynamicReferenceProvider();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
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
  });

  it("should find references in workspace files", async () => {
    const mockWord = "MyComponent";
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn().mockReturnValue(mockWord),
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = {
      isCancellationRequested: false,
    } as vscode.CancellationToken;

    const mockFiles = [
      { fsPath: "/path/to/file1.tsx" },
      { fsPath: "/path/to/file2.js" },
    ];

    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
    (fs.readFile as jest.Mock)
      .mockResolvedValueOnce(
        `const Component = dynamic(() => import("./MyComponent"));`
      )
      .mockResolvedValueOnce("");

    (path.resolve as jest.Mock).mockReturnValue("/path/to/MyComponent.tsx");
    (path.basename as jest.Mock).mockReturnValue("MyComponent");
    (path.extname as jest.Mock).mockReturnValue(".tsx");

    (vscode.Location as jest.Mock).mockImplementation((uri, position) => ({
      uri,
      position,
    }));

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );

    expect(vscode.workspace.findFiles).toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(vscode.Location).toHaveBeenCalled();
  });

  it("should handle errors while reading files", async () => {
    const mockWord = "MyComponent";
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn().mockReturnValue(mockWord),
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = {
      isCancellationRequested: false,
    } as vscode.CancellationToken;

    const mockFiles = [{ fsPath: "/path/to/file1.tsx" }];

    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
    (fs.readFile as jest.Mock).mockRejectedValue(new Error("File read error"));

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );

    expect(fs.readFile).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("should stop searching if cancellation token is triggered", async () => {
    const mockWord = "MyComponent";
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn().mockReturnValue(mockWord),
    } as unknown as vscode.TextDocument;

    const position = {} as vscode.Position;
    const context = {} as vscode.ReferenceContext;
    const token = { isCancellationRequested: true } as vscode.CancellationToken;

    const mockFiles = [{ fsPath: "/path/to/file1.tsx" }];

    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
    (fs.readFile as jest.Mock).mockResolvedValue(`
      const Component = dynamic(() => import("./MyComponent"));
    `);

    const result = await provider.provideReferences(
      document,
      position,
      context,
      token
    );

    expect(result).toEqual([]);
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
