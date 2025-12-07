import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveImportPath } from "../../helpers/resolver/resolve-import-path";

jest.mock("fs/promises");

describe("resolveImportPath", () => {
  const basePath = "/root/src/file.ts";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the directory entry file when resolved path is a directory with a valid file", async () => {
    // e.g. `targetPath = "../components/Button"`
    const targetPath = "../components/Button";

    // We'll pretend the resolved directory is `/root/src/../components/Button`,
    // which normalizes to `/root/src/components/Button`
    const resolvedDirectoryPath = path.resolve(
      path.dirname(basePath),
      targetPath
    );

    // Mock `fs.stat` to say this is a directory
    (fs.stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => true });

    // Mock `fs.readdir` to return a list of files in that directory
    (fs.readdir as jest.Mock).mockResolvedValueOnce([
      "Button.tsx",
      "README.md",
    ]);

    const result = await resolveImportPath(targetPath, basePath);

    // The function should join the directory path with 'Button.tsx'
    expect(result).toEqual([path.join(resolvedDirectoryPath, "Button.tsx")]);
  });

  it("falls back to adding extensions if the path is not a directory or doesn’t exist", async () => {
    const targetPath = "../utils/parseDate";
    const resolvedFilePath = path.resolve(path.dirname(basePath), targetPath);

    // First call to `fs.stat` for the plain `resolvedFilePath` should fail
    (fs.stat as jest.Mock).mockRejectedValueOnce(new Error("Not found"));

    // Then the function tries each extension in order:
    //  1) parseDate.tsx
    //  2) parseDate.ts
    //  3) parseDate.jsx
    //  4) parseDate.js
    //
    // We'll simulate that the first three do not exist,
    // and that the `.js` one does exist.
    (fs.stat as jest.Mock)
      .mockRejectedValueOnce(new Error("Not found .tsx"))
      .mockRejectedValueOnce(new Error("Not found .ts"))
      .mockRejectedValueOnce(new Error("Not found .jsx"))
      .mockResolvedValueOnce({ isDirectory: () => false }); // parseDate.js found

    const result = await resolveImportPath(targetPath, basePath);
    expect(result).toEqual([`${resolvedFilePath}.js`]);
  });

  it("returns empty if no extension file is found and path is not a directory", async () => {
    const targetPath = "../helpers/nonExistent";

    // The resolved path would be something like `/root/src/helpers/nonExistent`
    const _resolvedFilePath = path.resolve(path.dirname(basePath), targetPath);

    // 1) Throw for the directory check
    (fs.stat as jest.Mock).mockRejectedValueOnce(
      new Error("No such file or directory")
    );

    // 2) For each extension fallback attempt, also fail
    (fs.stat as jest.Mock)
      .mockRejectedValueOnce(new Error("No .tsx"))
      .mockRejectedValueOnce(new Error("No .ts"))
      .mockRejectedValueOnce(new Error("No .jsx"))
      .mockRejectedValueOnce(new Error("No .js"));

    const result = await resolveImportPath(targetPath, basePath);
    expect(result).toEqual([]);
  });

  it("returns empty if directory has no matching entry file", async () => {
    const targetPath = "../emptyDir";
    const _resolvedDirectoryPath = path.resolve(
      path.dirname(basePath),
      targetPath
    );

    // This time, it's a directory
    (fs.stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => true });
    // But the directory has no file that matches .js, .jsx, .ts, .tsx
    (fs.readdir as jest.Mock).mockResolvedValueOnce([
      "README.md",
      "something.txt",
    ]);

    const result = await resolveImportPath(targetPath, basePath);

    // Since no valid file was found, the function logs a warning and
    // returns the resolved directory path.
    expect(result).toEqual([]);
  });

  it("returns the resolved path if file already has a valid extension and exists", async () => {
    const targetPath = "../utils/parseDate.ts";

    const _resolvedFilePath = path.resolve(path.dirname(basePath), targetPath);

    // If `fs.stat` works out-of-the-box (meaning the file is found and is not a directory),
    // the function should just return the original resolved path.
    (fs.stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => false });

    const result = await resolveImportPath(targetPath, basePath);
    expect(result).toEqual([]);
  });
});
