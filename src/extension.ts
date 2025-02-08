import * as vscode from "vscode";
import { DynamicReferenceProvider } from "./dynamicReferenceProvider";

const subscriptions: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log("✅ Dynamic Import References Extension Activated!");

  const provider = vscode.languages.registerReferenceProvider(
    [
      { language: "javascript", scheme: "file" },
      { language: "typescript", scheme: "file" },
      { language: "javascriptreact", scheme: "file" },
      { language: "typescriptreact", scheme: "file" },
    ],
    new DynamicReferenceProvider()
  );

  subscriptions.push(provider);
  context.subscriptions.push(provider);
}

export function deactivate() {
  subscriptions.forEach((disposable) => disposable.dispose());
  subscriptions.length = 0;
  console.log("❌ Dynamic Import References Extension Deactivated!");
}
