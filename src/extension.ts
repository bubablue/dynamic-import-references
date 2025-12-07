import * as vscode from "vscode";
import { DynamicReferenceProvider } from "./dynamicReferenceProvider";
import { setCustomMatchers } from "./helpers/ast/dynamic-import-detection";
import { setRegexCustomMatchers } from "./helpers/regexp";
import { CustomMatcher } from "./types/customMatchers";

const subscriptions: vscode.Disposable[] = [];

function loadCustomMatchers(): void {
  const config = vscode.workspace.getConfiguration("dynamicImportReferences");
  const customMatchers: CustomMatcher[] = config.get("customMatchers", []);

  const validatedMatchers = customMatchers.filter((matcher) => {
    if (!matcher.kind) {
      console.warn(
        "Dynamic Import References: Custom matcher missing 'kind' property, skipping:",
        matcher
      );
      return false;
    }

    if (matcher.kind === "named" && (!matcher.name || !matcher.source)) {
      console.warn(
        "Dynamic Import References: Named matcher requires 'name' and 'source' properties, skipping:",
        matcher
      );
      return false;
    }

    if (matcher.kind === "default" && !matcher.source) {
      console.warn(
        "Dynamic Import References: Default matcher requires 'source' property, skipping:",
        matcher
      );
      return false;
    }

    if (
      matcher.kind === "member" &&
      (!matcher.source || !matcher.namespace || !matcher.member)
    ) {
      console.warn(
        "Dynamic Import References: Member matcher requires 'source', 'namespace', and 'member' properties, skipping:",
        matcher
      );
      return false;
    }

    if (matcher.kind === "identifier" && !matcher.name) {
      console.warn(
        "Dynamic Import References: Identifier matcher requires 'name' property, skipping:",
        matcher
      );
      return false;
    }

    return true;
  });

  setCustomMatchers(validatedMatchers);
  setRegexCustomMatchers(validatedMatchers);

  if (validatedMatchers.length > 0) {
    console.log(
      `✅ Dynamic Import References: Loaded ${validatedMatchers.length} custom matcher(s)`
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("✅ Dynamic Import References Extension Activated!");

  loadCustomMatchers();

  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("dynamicImportReferences.customMatchers")) {
      loadCustomMatchers();
    }
  });

  const provider = vscode.languages.registerReferenceProvider(
    [
      { language: "javascript", scheme: "file" },
      { language: "typescript", scheme: "file" },
      { language: "javascriptreact", scheme: "file" },
      { language: "typescriptreact", scheme: "file" },
    ],
    new DynamicReferenceProvider()
  );

  subscriptions.push(provider, configWatcher);
  context.subscriptions.push(provider, configWatcher);
}

export function deactivate() {
  for (const disposable of subscriptions) {
    disposable.dispose();
  }
  subscriptions.length = 0;
  console.log("❌ Dynamic Import References Extension Deactivated!");
}
