import path from "node:path";
import { removeDuplicateSuffix } from "../../helpers/fs/remove-duplicated-path";
import { resolveAlias } from "../../helpers/ts-config/resolve-alias";

jest.mock("../../helpers/fs/remove-duplicated-path");

describe("resolveAlias", () => {
  const mockedRemoveDuplicateSuffix =
    removeDuplicateSuffix as jest.MockedFunction<typeof removeDuplicateSuffix>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the original importPath if no alias matches", () => {
    const importPath = "@other/utils";
    const aliases = {
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"],
    };
    const tsConfigDir = "/project/tsconfigDir";

    const result = resolveAlias(importPath, aliases, tsConfigDir);
    expect(result).toBe(importPath);
    expect(mockedRemoveDuplicateSuffix).not.toHaveBeenCalled();
  });

  it("resolves a simple alias (no asterisk)", () => {
    // Suppose the alias is "@utils" -> "src/utils"
    const aliases = {
      "@utils": ["src/utils"],
    };
    const importPath = "@utils/helpers";
    const tsConfigDir = "/project/tsconfigDir";

    // We'll have removeDuplicateSuffix just return tsConfigDir
    mockedRemoveDuplicateSuffix.mockReturnValueOnce("/project/tsconfigDir");

    // When path.isAbsolute('src/utils') is false, we call removeDuplicateSuffix and path.resolve
    const result = resolveAlias(importPath, aliases, tsConfigDir);

    // We expect an absolute path: "/project/tsconfigDir/src/utils/helpers"
    // because aliasPrefix = "@utils", aliasTarget="src/utils", relativeImportPath="helpers"
    expect(result).toBe(path.join("/project/tsconfigDir/src/utils", "helpers"));
    expect(mockedRemoveDuplicateSuffix).toHaveBeenCalledWith(
      tsConfigDir,
      "src/utils"
    );
  });

  it("resolves an alias with asterisk", () => {
    // Suppose alias is "@utils/*" -> "src/utils/*"
    const aliases = {
      "@utils/*": ["src/utils/*"],
    };
    const importPath = "@utils/helpers/extra";
    const tsConfigDir = "/project/tsconfigDir";

    // Our mock can just return "/project/tsconfigDir"
    mockedRemoveDuplicateSuffix.mockReturnValueOnce("/project/tsconfigDir");

    const result = resolveAlias(importPath, aliases, tsConfigDir);
    // aliasPrefix = "@utils/", aliasTarget="src/utils/"
    // relativeImportPath="helpers/extra"
    // => final: /project/tsconfigDir/src/utils/helpers/extra
    expect(result).toBe("/project/tsconfigDir/src/utils/helpers/extra");
    expect(mockedRemoveDuplicateSuffix).toHaveBeenCalledTimes(1);
  });

  it("skips removeDuplicateSuffix when aliasTarget is already absolute", () => {
    // Suppose alias is "@utils/*" -> "/absolute/utils/*"
    const aliases = {
      "@utils/*": ["/absolute/utils/*"],
    };
    const importPath = "@utils/helpers";
    const tsConfigDir = "/project/tsconfigDir";

    const result = resolveAlias(importPath, aliases, tsConfigDir);

    // Should skip removeDuplicateSuffix because path.isAbsolute('/absolute/utils') is true
    expect(mockedRemoveDuplicateSuffix).not.toHaveBeenCalled();
    // Final path => path.join('/absolute/utils', 'helpers')
    expect(result).toBe("/absolute/utils/helpers");
  });

  it("handles multiple targetPaths but only uses the first", () => {
    const aliases = {
      "@utils/*": ["src/utils/*", "some/other/path"],
    };
    const importPath = "@utils/foo";
    const tsConfigDir = "/project/tsconfigDir";

    // We'll have removeDuplicateSuffix just return tsConfigDir
    mockedRemoveDuplicateSuffix.mockReturnValueOnce("/project/tsconfigDir");

    const result = resolveAlias(importPath, aliases, tsConfigDir);

    // Only the FIRST entry in the array is used => "src/utils/*"
    expect(result).toBe("/project/tsconfigDir/src/utils/foo");
    expect(mockedRemoveDuplicateSuffix).toHaveBeenCalledWith(
      "/project/tsconfigDir",
      "src/utils/"
    );
  });
});
