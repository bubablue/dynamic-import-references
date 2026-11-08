import { loadTsConfig } from "../../helpers/ts-config/load-ts-config";
import { createFixture, Fixture } from "../fixtures/create-fixture";

describe("loadTsConfig", () => {
  let fixture: Fixture;

  afterEach(() => fixture.cleanup());

  it("reads paths and baseUrl relative to the config, tolerating JSONC", () => {
    fixture = createFixture({
      "tsconfig.json": `{
        // comment
        "compilerOptions": {
          "baseUrl": "./src",
          "paths": { "@ui/*": ["ui/*"], },
        },
      }`,
    });

    expect(loadTsConfig(fixture.file("tsconfig.json"))).toEqual({
      baseUrl: fixture.file("src"),
      paths: { "@ui/*": ["ui/*"] },
      pathsBasePath: fixture.root,
    });
  });

  it("inherits paths from an extended config and keeps the parent directory as base", () => {
    fixture = createFixture({
      "tsconfig.base.json": `{ "compilerOptions": { "paths": { "~/app/*": ["apps/app/src/*"] } } }`,
      "apps/app/tsconfig.json": `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "preserve" } }`,
    });

    expect(loadTsConfig(fixture.file("apps/app/tsconfig.json"))).toEqual({
      paths: { "~/app/*": ["apps/app/src/*"] },
      pathsBasePath: fixture.root,
    });
  });

  it("lets the child override paths and resolves its own base", () => {
    fixture = createFixture({
      "tsconfig.base.json": `{ "compilerOptions": { "baseUrl": ".", "paths": { "a/*": ["x/*"] } } }`,
      "pkg/tsconfig.json": `{ "extends": "../tsconfig.base", "compilerOptions": { "paths": { "b/*": ["y/*"] } } }`,
    });

    expect(loadTsConfig(fixture.file("pkg/tsconfig.json"))).toEqual({
      baseUrl: fixture.root,
      paths: { "b/*": ["y/*"] },
      pathsBasePath: fixture.file("pkg"),
    });
  });

  it("supports extends arrays where later entries win", () => {
    fixture = createFixture({
      "one.json": `{ "compilerOptions": { "baseUrl": "one", "paths": { "a/*": ["1/*"] } } }`,
      "two.json": `{ "compilerOptions": { "paths": { "a/*": ["2/*"] } } }`,
      "tsconfig.json": `{ "extends": ["./one.json", "./two.json"] }`,
    });

    expect(loadTsConfig(fixture.file("tsconfig.json"))).toEqual({
      baseUrl: fixture.file("one"),
      paths: { "a/*": ["2/*"] },
      pathsBasePath: fixture.root,
    });
  });

  it("resolves extends from node_modules packages", () => {
    fixture = createFixture({
      "node_modules/@acme/tsconfig/tsconfig.json": `{ "compilerOptions": { "paths": { "@acme/*": ["libs/*"] } } }`,
      "app/tsconfig.json": `{ "extends": "@acme/tsconfig" }`,
    });

    expect(loadTsConfig(fixture.file("app/tsconfig.json"))).toEqual({
      paths: { "@acme/*": ["libs/*"] },
      pathsBasePath: fixture.file("node_modules/@acme/tsconfig"),
    });
  });

  it("stops on circular extends", () => {
    fixture = createFixture({
      "a.json": `{ "extends": "./b.json", "compilerOptions": { "baseUrl": "a" } }`,
      "b.json": `{ "extends": "./a.json", "compilerOptions": { "baseUrl": "b" } }`,
    });

    expect(loadTsConfig(fixture.file("a.json"))).toEqual({ baseUrl: fixture.file("a") });
  });

  it("returns an empty config for missing or invalid files", () => {
    fixture = createFixture({ "broken.json": "not json at all {" });

    expect(loadTsConfig(fixture.file("missing.json"))).toEqual({});
    expect(loadTsConfig(fixture.file("broken.json"))).toEqual({});
  });
});
