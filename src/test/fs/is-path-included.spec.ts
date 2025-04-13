import { isIncluded } from "../../helpers/fs/is-path-included";

describe("isIncluded", () => {
  it("should return true if the target is a parent directory of the base", () => {
    expect(isIncluded("src/utils", "src/utils/helpers.ts")).toBe(true);
    expect(isIncluded("src", "src/components/Button.tsx")).toBe(true);
    expect(isIncluded("src/utils", "src/utils/index.ts")).toBe(true);
  });

  it("should return true if the base and target are the same", () => {
    expect(isIncluded("src/index", "src/index.ts")).toBe(true);
    expect(isIncluded("app/main", "app/main.js")).toBe(true);
  });

  it("should return false if the target is outside the base", () => {
    expect(isIncluded("lib", "src/components/Button.tsx")).toBe(false);
    expect(isIncluded("src", "tests/test.spec.ts")).toBe(false);
  });

  it("should return true when using relative paths", () => {
    expect(isIncluded("src/utils", "./src/utils/index.ts")).toBe(true);
    expect(isIncluded("src/utils", "../src/utils/index.ts")).toBe(true);
  });

  it("should return false if base has no overlapping parts with target", () => {
    expect(isIncluded("src/utils", "lib/module.ts")).toBe(false);
  });

  it("should ignore extensions in base", () => {
    expect(isIncluded("src/utils/index", "src/utils/index.ts")).toBe(true);
    expect(isIncluded("app/main", "app/main.js")).toBe(true);
  });

  it("should return false for an empty target", () => {
    expect(isIncluded("", "src/utils/helpers.ts")).toBe(false);
    expect(isIncluded("", "src/index.ts")).toBe(false);
  });

  it("should return false if target has extra directories that base does not", () => {
    expect(
      isIncluded("src/utils/helpers/something.ts", "src/utils/helpers")
    ).toBe(false);
  });
});
