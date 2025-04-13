export function findLineAndCharPosition(
  text: string,
  matchIndex: number
): { line: number; char: number } {
  const lines = text.split("\n");

  const line = lines.findIndex(
    (_, idx) => lines.slice(0, idx + 1).join("\n").length >= matchIndex
  );

  if (line === -1) {
    return { line: 0, char: 0 };
  }

  const prevChars = lines.slice(0, line).join("\n").length;
  return { line, char: matchIndex - prevChars - (line > 0 ? 1 : 0) };
}
