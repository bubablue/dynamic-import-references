import * as fs from "node:fs";
import * as path from "node:path";
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

  it("resolves relative imports in plain JavaScript projects without any config", () => {
    fixture = createFixture({
      "src/app.jsx": "",
      "src/pages/home.jsx": "",
      "src/widgets/index.js": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("src/app.jsx");

    expect(resolver.resolve("./pages/home", from)).toBe(fixture.file("src/pages/home.jsx"));
    expect(resolver.resolve("./widgets", from)).toBe(fixture.file("src/widgets/index.js"));
    expect(resolver.resolve("lodash", from)).toBeUndefined();
    expect(resolver.resolve("node:fs", from)).toBeUndefined();
  });

  it("resolves package.json imports with patterns and conditions", () => {
    fixture = createFixture({
      "package.json": JSON.stringify({
        imports: {
          "#widgets/*": "./src/widgets/*.jsx",
          "#config": { types: "./types/config.d.ts", import: "./src/config.mjs", default: "./src/config.cjs" },
        },
      }),
      "src/app.js": "",
      "src/widgets/banner.jsx": "",
      "src/config.mjs": "",
      "types/config.d.ts": "",
    });
    const resolver = new ModuleResolver();
    const from = fixture.file("src/app.js");

    expect(resolver.resolve("#widgets/banner", from)).toBe(fixture.file("src/widgets/banner.jsx"));
    expect(resolver.resolve("#config", from)).toBe(fixture.file("src/config.mjs"));
    expect(resolver.resolve("#missing", from)).toBeUndefined();
  });

  it("resolves workspace packages through node_modules links", () => {
    fixture = createFixture({
      "apps/web/src/app.jsx": "",
      "packages/ui/package.json": JSON.stringify({
        name: "@acme/ui",
        exports: { ".": { types: "./dist/index.d.ts", default: "./src/index.js" }, "./*": "./src/*.jsx" },
      }),
      "packages/ui/src/index.js": "",
      "packages/ui/src/button.jsx": "",
      "packages/utils/package.json": JSON.stringify({ name: "utils", main: "lib/main.js" }),
      "packages/utils/lib/main.js": "",
      "packages/utils/lib/format.js": "",
    });
    fs.mkdirSync(fixture.file("node_modules/@acme"), { recursive: true });
    fs.symlinkSync(path.join("..", "..", "packages", "ui"), fixture.file("node_modules/@acme/ui"));
    fs.symlinkSync(path.join("..", "packages", "utils"), fixture.file("node_modules/utils"));
    const resolver = new ModuleResolver();
    const from = fixture.file("apps/web/src/app.jsx");

    expect(resolver.resolve("@acme/ui", from)).toBe(fixture.file("packages/ui/src/index.js"));
    expect(resolver.resolve("@acme/ui/button", from)).toBe(fixture.file("packages/ui/src/button.jsx"));
    expect(resolver.resolve("utils", from)).toBe(fixture.file("packages/utils/lib/main.js"));
    expect(resolver.resolve("utils/lib/format", from)).toBe(fixture.file("packages/utils/lib/format.js"));
  });

  it("leaves third-party packages unresolved", () => {
    fixture = createFixture({
      "src/app.js": "",
      "node_modules/.pnpm/left-pad@1.0.0/node_modules/left-pad/package.json": JSON.stringify({ main: "index.js" }),
      "node_modules/.pnpm/left-pad@1.0.0/node_modules/left-pad/index.js": "",
      "node_modules/react/package.json": JSON.stringify({ main: "index.js" }),
      "node_modules/react/index.js": "",
    });
    fs.symlinkSync(path.join(".pnpm", "left-pad@1.0.0", "node_modules", "left-pad"), fixture.file("node_modules/left-pad"));
    const resolver = new ModuleResolver();

    expect(resolver.resolve("left-pad", fixture.file("src/app.js"))).toBeUndefined();
    expect(resolver.resolve("react", fixture.file("src/app.js"))).toBeUndefined();
  });

  describe("aliases that are not declared in any config", () => {
    const project = {
      "package.json": JSON.stringify({ name: "app" }),
      "vite.config.js": "export default { resolve: { alias: { '@': 'src', '@ui': 'src/shared/ui' } } };",
      "src/components/Modal.jsx": "",
      "src/features/cart/Cart.jsx": "",
      "src/features/cart/components/Modal.jsx": "",
      "src/shared/ui/Input.jsx": "",
      "src/lib/Chart.jsx": "",
      "src/widgets/a/Card.jsx": "",
      "src/widgets/b/Card.jsx": "",
      "node_modules/lodash/package.json": JSON.stringify({ main: "lodash.js" }),
      "node_modules/lodash/lodash.js": "",
      "src/lodash/index.js": "",
    };
    const workspaceFiles = () =>
      new Set(Object.keys(project).filter((file) => file.startsWith("src/")).map((file) => fixture.file(file)));

    it("resolves from the package root down, so feature-local files never shadow the alias", () => {
      fixture = createFixture(project);
      const resolver = new ModuleResolver(workspaceFiles);
      const from = fixture.file("src/features/cart/Cart.jsx");

      expect(resolver.resolve("@/components/Modal", from)).toBe(fixture.file("src/components/Modal.jsx"));
      expect(resolver.resolve("~/components/Modal", from)).toBe(fixture.file("src/components/Modal.jsx"));
      expect(resolver.resolve("lib/Chart", from)).toBe(fixture.file("src/lib/Chart.jsx"));
    });

    it("accepts a workspace match only when it is unique", () => {
      fixture = createFixture(project);
      const resolver = new ModuleResolver(workspaceFiles);
      const from = fixture.file("src/features/cart/Cart.jsx");

      expect(resolver.resolve("@ui/Input", from)).toBe(fixture.file("src/shared/ui/Input.jsx"));
      expect(resolver.resolve("@widgets/Card", from)).toBeUndefined();
      expect(resolver.resolve("@widgets/b/Card", from)).toBe(fixture.file("src/widgets/b/Card.jsx"));
    });

    it("never treats an installed package as an alias", () => {
      fixture = createFixture(project);
      const resolver = new ModuleResolver(workspaceFiles);

      expect(resolver.resolve("lodash", fixture.file("src/features/cart/Cart.jsx"))).toBeUndefined();
    });

    it("retries once the workspace file list is available", () => {
      fixture = createFixture(project);
      let files: ReadonlySet<string> | undefined;
      const resolver = new ModuleResolver(() => files);
      const from = fixture.file("src/features/cart/Cart.jsx");

      expect(resolver.resolve("@ui/Input", from)).toBeUndefined();
      files = workspaceFiles();
      expect(resolver.resolve("@ui/Input", from)).toBe(fixture.file("src/shared/ui/Input.jsx"));
    });
  });
});
