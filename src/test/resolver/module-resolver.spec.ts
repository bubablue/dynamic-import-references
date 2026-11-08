import {
  matchPathsPattern,
  ModuleResolver,
} from "../../helpers/resolver/module-resolver";
import { createFixture, Fixture } from "../fixtures/create-fixture";

describe("matchPathsPattern", () => {
  const paths = {
    "@ui/*": ["ui/components/*"],
    "@ui/hooks/*": ["ui/hooks/*"],
    "@ui/hooks": ["ui/hooks/index.ts"],
    "*.svg": ["assets/*.svg"],
  };

  it("prefers the longest matching prefix over declaration order", () => {
    expect(matchPathsPattern(paths, "@ui/hooks/use-x")).toEqual({
      substitutions: ["ui/hooks/*"],
      captured: "use-x",
    });
  });

  it("prefers an exact key over wildcard patterns", () => {
    expect(matchPathsPattern(paths, "@ui/hooks")).toEqual({
      substitutions: ["ui/hooks/index.ts"],
      captured: "",
    });
  });

  it("honours suffixes", () => {
    expect(matchPathsPattern(paths, "logo.svg")?.captured).toBe("logo");
  });

  it("returns undefined when nothing matches", () => {
    expect(matchPathsPattern(paths, "react")).toBeUndefined();
  });
});

describe("ModuleResolver", () => {
  let fixture: Fixture;

  afterEach(() => fixture.cleanup());

  it("resolves relative files before directory indexes, like TypeScript", () => {
    fixture = createFixture({
      "src/page.tsx": "",
      "src/mobile.tsx": "",
      "src/mobile/index.tsx": "",
      "src/desktop/index.ts": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("src/page.tsx");

    expect(resolver.resolve("./mobile", from)).toBe(fixture.file("src/mobile.tsx"));
    expect(resolver.resolve("./desktop", from)).toBe(fixture.file("src/desktop/index.ts"));
  });

  it("maps .js specifiers to TypeScript sources and accepts explicit extensions", () => {
    fixture = createFixture({
      "src/page.ts": "",
      "src/util.ts": "",
      "src/view.tsx": "",
      "src/legacy.js": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("src/page.ts");

    expect(resolver.resolve("./util.js", from)).toBe(fixture.file("src/util.ts"));
    expect(resolver.resolve("./view.tsx", from)).toBe(fixture.file("src/view.tsx"));
    expect(resolver.resolve("./legacy.js", from)).toBe(fixture.file("src/legacy.js"));
  });

  it("ignores non-code and missing targets", () => {
    fixture = createFixture({ "src/page.ts": "", "src/data.json": "{}" });
    const resolver = new ModuleResolver();

    expect(resolver.resolve("./data.json", fixture.file("src/page.ts"))).toBeUndefined();
    expect(resolver.resolve("./nope", fixture.file("src/page.ts"))).toBeUndefined();
  });

  it("resolves monorepo aliases from the importer's own tsconfig chain", () => {
    fixture = createFixture({
      "tsconfig.base.json": `{
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@ui/*": ["packages/ui/src/components/*"],
            "@ui/hooks/*": ["packages/ui/src/hooks/*"],
            "~/account/widgets/*": ["apps/account/src/widgets/*"]
          }
        }
      }`,
      "apps/shell/tsconfig.json": `{ "extends": "../../tsconfig.base.json" }`,
      "apps/shell/src/page.tsx": "",
      "apps/account/src/widgets/balance/index.tsx": "",
      "packages/ui/src/hooks/use-device.ts": "",
      "packages/ui/src/components/button.tsx": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("apps/shell/src/page.tsx");

    expect(resolver.resolve("~/account/widgets/balance", from)).toBe(
      fixture.file("apps/account/src/widgets/balance/index.tsx")
    );
    expect(resolver.resolve("@ui/hooks/use-device", from)).toBe(
      fixture.file("packages/ui/src/hooks/use-device.ts")
    );
    expect(resolver.resolve("@ui/button", from)).toBe(
      fixture.file("packages/ui/src/components/button.tsx")
    );
  });

  it("tries substitutions in order and falls back to baseUrl", () => {
    fixture = createFixture({
      "jsconfig.json": `{
        "compilerOptions": {
          "baseUrl": "src",
          "paths": { "@/*": ["generated/*", "lib/*"] }
        }
      }`,
      "src/app.js": "",
      "src/lib/format.js": "",
      "src/shared/env.js": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("src/app.js");

    expect(resolver.resolve("@/format", from)).toBe(fixture.file("src/lib/format.js"));
    expect(resolver.resolve("shared/env", from)).toBe(fixture.file("src/shared/env.js"));
    expect(resolver.resolve("react", from)).toBeUndefined();
  });

  it("resolves paths relative to the declaring config when there is no baseUrl", () => {
    fixture = createFixture({
      "configs/tsconfig.paths.json": `{ "compilerOptions": { "paths": { "#lib/*": ["../lib/*"] } } }`,
      "tsconfig.json": `{ "extends": "./configs/tsconfig.paths.json" }`,
      "lib/math.ts": "",
      "app.ts": "",
    });
    const resolver = new ModuleResolver();

    expect(resolver.resolve("#lib/math", fixture.file("app.ts"))).toBe(fixture.file("lib/math.ts"));
  });
});
