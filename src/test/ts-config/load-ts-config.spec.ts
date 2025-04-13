import * as fs from "fs/promises";
import { loadTsConfig } from "../../helpers/ts-config/load-ts-config";

// We'll mock the filesystem module to avoid actual disk I/O.
jest.mock("fs/promises");

describe("loadTsConfig", () => {
  const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty object if reading the file fails", async () => {
    // If readFile throws an error, the function should catch it and return {}
    mockedReadFile.mockRejectedValueOnce(new Error("File not found"));

    const result = await loadTsConfig("/path/to/tsconfig.json");
    expect(result).toEqual({});
  });

  it('returns the "paths" from a basic tsconfig with no extends', async () => {
    const sampleConfig = {
      compilerOptions: {
        paths: {
          "@components/*": ["src/components/*"],
          "@utils/*": ["src/utils/*"],
        },
      },
    };
    // readFile resolves to a JSON string
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(sampleConfig));

    const result = await loadTsConfig("/path/to/tsconfig.json");
    expect(result).toEqual({
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"],
    });
  });

  it("merges paths from extends", async () => {
    const childConfig = {
      extends: "../parent-tsconfig.json",
      compilerOptions: {
        paths: {
          "@child/*": ["src/child/*"],
          "@shared/*": ["src/childShared/*"], // override
        },
      },
    };

    const parentConfig = {
      compilerOptions: {
        paths: {
          "@parent/*": ["src/parent/*"],
          "@shared/*": ["src/shared/*"],
        },
      },
    };

    // First call: child config
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(childConfig));
    // Second call: parent config
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(parentConfig));

    const result = await loadTsConfig("/path/to/child-tsconfig.json");
    expect(mockedReadFile).toHaveBeenCalledTimes(2);
    // Check the merged paths
    expect(result).toEqual({
      "@parent/*": ["src/parent/*"],
      "@shared/*": ["src/childShared/*"], // child overrides
      "@child/*": ["src/child/*"],
    });
  });

  it("returns an empty object if the tsconfig is malformed JSON", async () => {
    // readFile returns an invalid JSON
    mockedReadFile.mockResolvedValueOnce("Not valid JSON...");
    const result = await loadTsConfig("/path/to/bad-tsconfig.json");
    expect(result).toEqual({});
  });
});
