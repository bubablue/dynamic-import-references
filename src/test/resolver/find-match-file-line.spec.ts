import { findLineAndCharPosition } from "../../helpers/resolver/find-match-file-line";

describe("findLineAndCharPosition", () => {
  it("returns line=0, char=0 for matchIndex = 0", () => {
    const text = "Hello\nWorld";
    const { line, char } = findLineAndCharPosition(text, 0);
    expect(line).toBe(0);
    expect(char).toBe(0);
  });

  it("correctly identifies a position in the first line", () => {
    // "Hello\nWorld"
    // Indices: H=0, e=1, l=2, l=3, o=4
    const text = "Hello\nWorld";
    const matchIndex = 2; // pointing to the third character 'l'
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    expect(line).toBe(0); // first line
    expect(char).toBe(2); // third character in that line
  });

  it("correctly identifies a position in the second line", () => {
    // "Hello\nWorld"
    // "Hello" length is 5, plus 1 for newline => total 6 chars before "W"
    // Indices: 0=H,1=e,2=l,3=l,4=o,5=\n,6=W,7=o,8=r,9=l,10=d
    const text = "Hello\nWorld";
    const matchIndex = 7; // pointing to 'o' in 'World'
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    expect(line).toBe(1); // second line (0-based)
    expect(char).toBe(1); // 'o' is the second character in "World"
  });

  it("correctly identifies a position right on a newline character", () => {
    // "One\nTwo\nThree"
    // Indices: 'One' => 0=O,1=n,2=e; newline => 3=\n
    const text = "One\nTwo\nThree";
    const matchIndex = 3; // pointing to the newline after 'One'
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    // Because the newline character belongs to the end of line 0,
    // the function's logic might place you either at end of line 0
    // or start of line 1, depending on how you interpret the logic.
    // For this function, it should return line=0, char=3
    // because the first line has length 3: "One"
    expect(line).toBe(0);
    expect(char).toBe(3);
  });

  it("returns { line: 0, char: 0 } if matchIndex is out of range (too large)", () => {
    const text = "Short text";
    const matchIndex = 999; // out of range
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    expect(line).toBe(0);
    expect(char).toBe(0);
  });

  it("returns { line: 0, char: 0 } for empty text regardless of matchIndex", () => {
    const text = "";
    const matchIndex = 5; // no matter what index, text is empty
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    expect(line).toBe(0);
    expect(char).toBe(0);
  });

  it("works for single-line text", () => {
    const text = "SingleLine";
    // Indices: S=0, i=1, n=2, g=3, l=4, e=5, L=6, i=7, n=8, e=9
    const matchIndex = 5; // pointing to 'e'
    const { line, char } = findLineAndCharPosition(text, matchIndex);

    // There's only one line (line=0), so char should be 5
    expect(line).toBe(0);
    expect(char).toBe(5);
  });
});
