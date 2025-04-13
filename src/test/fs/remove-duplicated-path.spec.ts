import { removeDuplicateSuffix } from "../../helpers/fs/remove-duplicated-path";

describe("removeDuplicateSuffix", () => {
  it("should remove a common suffix if found", () => {
    expect(removeDuplicateSuffix("src/utils/helpers", "utils/helpers")).toBe(
      "src/"
    );
    expect(
      removeDuplicateSuffix("app/components/button", "components/button")
    ).toBe("app/");
  });

  it("should return the basePath unchanged if no common suffix is found", () => {
    expect(removeDuplicateSuffix("src/utils/helpers", "lib/models")).toBe(
      "src/utils/helpers"
    );
    expect(removeDuplicateSuffix("project/src/index", "docs/index")).toBe(
      "project/src/index"
    );
  });

  it("should handle cases where the entire basePath matches the targetPath", () => {
    expect(
      removeDuplicateSuffix("src/utils/helpers", "src/utils/helpers")
    ).toBe("");
  });

  it("should return base if no overlap but a partial match is found in a section", () => {
    const base = "src/utils/helpers/test";
    const target = "helpers";
    expect(removeDuplicateSuffix(base, target)).toBe(base);
  });

  it("should handle paths without trailing slashes", () => {
    expect(removeDuplicateSuffix("src/utils", "utils")).toBe("src/");
    expect(removeDuplicateSuffix("project/src/utils", "src/utils")).toBe(
      "project/"
    );
  });

  it("should return an unchanged basePath if targetPath is empty", () => {
    expect(removeDuplicateSuffix("src/utils/helpers", "")).toBe(
      "src/utils/helpers"
    );
  });
});
