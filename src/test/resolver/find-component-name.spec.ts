import * as fs from "fs/promises";
import { extractComponentNames } from "../../helpers/resolver/find-component-name";

jest.mock("fs/promises");

describe("extractComponentNames", () => {
  const mockFilePath = "some/file/path.ts";
  const documentPath = "some/file/path.ts";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty array if filePath does not match documentPath", async () => {
    const result = await extractComponentNames(
      mockFilePath,
      "different/path.ts"
    );
    expect(result).toEqual([]);
  });

  it("returns an empty array if file read fails", async () => {
    (fs.readFile as jest.Mock).mockRejectedValueOnce(
      new Error("File read error")
    );

    const result = await extractComponentNames(mockFilePath, documentPath);
    expect(result).toEqual([]);
  });

  it("returns an empty array if no matches are found", async () => {
    (fs.readFile as jest.Mock).mockResolvedValueOnce(`
      // Some random text with no exports
      const notExported = "test";
    `);

    const result = await extractComponentNames(mockFilePath, documentPath);
    expect(result).toEqual([]);
  });

  it("returns matched export names for various export statements", async () => {
    (fs.readFile as jest.Mock).mockResolvedValueOnce(`
      export const MyConst = 'value';
      export function myFunction() {}
      export class MyClass {}
      export default class DefaultClass {}
      export default function defaultFunction() {}
      export default const defaultConst = 123; // Rare pattern but still test
    `);

    const result = await extractComponentNames(mockFilePath, documentPath);
    /**
     * Explanation of captures:
     * - "MyConst" from `export const MyConst = ...`
     * - "myFunction" from `export function myFunction() {}`
     * - "MyClass" from `export class MyClass {}`
     * - "DefaultClass" from `export default class DefaultClass {}`
     * - "defaultFunction" from `export default function defaultFunction() {}`
     * - "defaultConst" from `export default const defaultConst = 123;`
     *
     * Note: The default export lines are also picked up by the regex because
     * it includes optional `default` and then a named identifier after
     * `(?:const|let|var|function|class)?\s*(\w+)`.
     */
    expect(result).toEqual([
      "MyConst",
      "myFunction",
      "MyClass",
      "DefaultClass",
      "defaultFunction",
      "defaultConst",
    ]);
  });
});
