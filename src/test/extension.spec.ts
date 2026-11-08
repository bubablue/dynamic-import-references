import * as vscode from "vscode";
import { DynamicReferenceProvider } from "../dynamicReferenceProvider";
import { activate, deactivate } from "../extension";

jest.mock("vscode", () => ({
  ...jest.requireActual("vscode"),
  languages: {
    registerReferenceProvider: jest.fn(() => ({
      dispose: jest.fn(),
    })),
  },
}));

jest.mock("../dynamicReferenceProvider", () => ({
  DynamicReferenceProvider: jest.fn(function (this: Record<string, jest.Mock>) {
    this.clearCache = jest.fn();
    this.fileChanged = jest.fn();
    this.fileCreated = jest.fn();
    this.fileDeleted = jest.fn();
    this.configChanged = jest.fn();
  }),
}));

describe("VS Code Extension", () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    jest.clearAllMocks();
  });

  it("should activate the extension and register a reference provider", () => {
    activate(context);

    expect(vscode.languages.registerReferenceProvider).toHaveBeenCalledWith(
      [
        { language: "javascript", scheme: "file" },
        { language: "typescript", scheme: "file" },
        { language: "javascriptreact", scheme: "file" },
        { language: "typescriptreact", scheme: "file" },
      ],
      expect.any(DynamicReferenceProvider)
    );

    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it("should clear the provider cache when custom matchers change", () => {
    activate(context);
    const provider = (vscode.languages.registerReferenceProvider as jest.Mock).mock.calls[0][1];
    const onChange = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];
    provider.clearCache.mockClear();

    onChange({ affectsConfiguration: (key: string) => key === "dynamicImportReferences.customMatchers" });

    expect(provider.clearCache).toHaveBeenCalledTimes(1);
  });

  it("should forward file system events to the provider", () => {
    activate(context);
    const provider = (vscode.languages.registerReferenceProvider as jest.Mock).mock.calls[0][1];
    const [sources, configs] = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.map(
      (result) => result.value
    );
    const uri = { fsPath: "/project/src/page.tsx" };

    sources.onDidChange.mock.calls[0][0](uri);
    sources.onDidCreate.mock.calls[0][0](uri);
    sources.onDidDelete.mock.calls[0][0](uri);
    configs.onDidChange.mock.calls[0][0]();

    expect(provider.fileChanged).toHaveBeenCalledWith(uri.fsPath);
    expect(provider.fileCreated).toHaveBeenCalledWith(uri.fsPath);
    expect(provider.fileDeleted).toHaveBeenCalledWith(uri.fsPath);
    expect(provider.configChanged).toHaveBeenCalledTimes(1);
  });

  it("should deactivate the extension and dispose of all subscriptions", () => {
    activate(context);
    const mockDisposable = context.subscriptions[0];

    deactivate();

    expect(mockDisposable.dispose).toHaveBeenCalled();
  });
});
