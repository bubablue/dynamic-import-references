const vscode = {
    workspace: {
      findFiles: jest.fn(),
    },
    Position: jest.fn().mockImplementation((line, char) => ({ line, char })),
    Location: jest.fn().mockImplementation((uri, position) => ({ uri, position })),
    Uri: {
      file: jest.fn().mockImplementation((path) => ({ fsPath: path })),
    },
    Range: jest.fn().mockImplementation(
      (startLine: number, startChar: number, endLine: number, endChar: number) => ({
        start: { line: startLine, char: startChar },
        end: { line: endLine, char: endChar },
      })
    ),
  };
  
  export = vscode;
  