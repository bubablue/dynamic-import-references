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
  DynamicReferenceProvider: jest.fn(),
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

  it("should deactivate the extension and dispose of all subscriptions", () => {
    activate(context);
    const mockDisposable = context.subscriptions[0];

    deactivate();

    expect(mockDisposable.dispose).toHaveBeenCalled();
  });
});
