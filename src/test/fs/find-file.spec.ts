import * as fs from "fs/promises";
import * as path from "path";
import { findFile } from "../../helpers/fs/find-file";

jest.mock("fs/promises", () => ({
  access: jest.fn(),
}));

describe("findFile", () => {
  const mockAccess = fs.access as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return the file path if the file exists in the same directory", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const filePath = "/projects/my-app/src/index.ts";
    const fileName = "config.json";

    const result = await findFile(filePath, fileName);
    expect(result).toBe(path.join(path.dirname(filePath), fileName));
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it("should search parent directories until it finds the file", async () => {
    mockAccess
      .mockRejectedValueOnce(new Error("File not found"))
      .mockResolvedValueOnce(undefined);

    const filePath = "/projects/my-app/src/index.ts";
    const fileName = "config.json";

    const result = await findFile(filePath, fileName);
    expect(result).toBe("/projects/my-app/config.json");
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });

  it("should return null if the file is not found in any parent directory", async () => {
    mockAccess.mockRejectedValue(new Error("File not found"));

    const filePath = "/projects/my-app/src/index.ts";
    const fileName = "config.json";

    const result = await findFile(filePath, fileName);
    expect(result).toBeNull();
    expect(mockAccess).toHaveBeenCalledTimes(4);
  });

  it("should stop searching when reaching the root directory", async () => {
    mockAccess.mockRejectedValue(new Error("File not found"));

    const filePath = "/index.ts";
    const fileName = "config.json";

    const result = await findFile(filePath, fileName);
    expect(result).toBeNull();
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });
});
