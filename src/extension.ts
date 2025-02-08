import * as vscode from 'vscode';
import { DynamicReferenceProvider } from './dynamicReferenceProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('✅ Dynamic Import References Extension Activated!'); // Add log

  const provider = vscode.languages.registerReferenceProvider(
    [
      { language: 'javascript', scheme: 'file' },
      { language: 'typescript', scheme: 'file' },
      { language: 'javascriptreact', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' }
    ],
    new DynamicReferenceProvider()
  );

  context.subscriptions.push(provider);
}

export function deactivate() {}
