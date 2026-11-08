import { parseCodeToAST } from "../../helpers/ast/ast-utils";
import { setCustomMatchers } from "../../helpers/ast/dynamic-import-detection";
import { collectImportSites, ImportSite, SourceRange } from "../../helpers/ast/import-sites";

const sitesOf = (code: string): ImportSite[] => collectImportSites(parseCodeToAST(code));
const only = (code: string): ImportSite => {
  const sites = sitesOf(code);
  expect(sites).toHaveLength(1);
  return sites[0];
};
const at = (line: number, character: number, length: number): SourceRange => ({
  line,
  character,
  endLine: line,
  endCharacter: character + length,
});

describe("collectImportSites", () => {
  afterEach(() => setCustomMatchers([]));

  it("treats a wrapper assigned to a variable as a default import with usages", () => {
    const site = only(
      [
        "import dynamic from 'next/dynamic';",
        "const Banner = dynamic(() => import('./banner'));",
        "export const Page = () => <Banner title={Banner.name} />;",
      ].join("\n")
    );

    expect(site).toEqual({
      specifier: "./banner",
      names: ["default"],
      all: false,
      wrapped: true,
      anchor: at(1, 15, 7),
      usages: [at(2, 27, 6), at(2, 41, 6)],
      nameRanges: new Map(),
    });
  });

  it("detects wrappers that are object values and use type arguments", () => {
    const sites = sitesOf(
      [
        "import dynamic from 'next/dynamic';",
        "export const Views = {",
        "  card: dynamic<Props>(() => import('./card'), { ssr: false }),",
        "  [Kind.Spread]: dynamic(() => import('./spread')),",
        "};",
      ].join("\n")
    );

    expect(sites.map((site) => [site.specifier, site.wrapped, site.names, site.anchor])).toEqual([
      ["./card", true, ["default"], at(2, 8, 7)],
      ["./spread", true, ["default"], at(3, 17, 7)],
    ]);
  });

  it("anchors member wrappers on the member name", () => {
    const site = only(
      ["import React from 'react';", "const Chart = React.lazy(() => import('./chart'));"].join("\n")
    );

    expect(site.wrapped).toBe(true);
    expect(site.anchor).toEqual(at(1, 20, 4));
  });

  it("reads named exports picked inside then callbacks", () => {
    const sites = sitesOf(
      [
        "import { lazy } from 'react';",
        "const A = lazy(() => import('./a').then((m) => ({ default: m.Named })));",
        "const B = lazy(() => import('./b').then(({ Other }) => ({ default: Other })));",
      ].join("\n")
    );

    expect(sites.map((site) => [site.wrapped, site.names, site.all])).toEqual([
      [true, ["Named"], false],
      [true, ["Other"], false],
    ]);
  });

  it("follows awaited imports inside block-bodied wrapper callbacks", () => {
    const site = only(
      [
        "import { lazy } from 'react';",
        "const A = lazy(async () => {",
        "  const mod = await import('./a');",
        "  return { default: mod.Panel };",
        "});",
      ].join("\n")
    );

    expect(site.wrapped).toBe(true);
    expect(site.names).toEqual(["Panel"]);
  });

  it("records where each named export of an unwrapped import is read", () => {
    const sites = sitesOf(
      [
        "async function run() {",
        "  const { load, save: persist } = await import('./api');",
        "  const barrel = await import('./index');",
        "  expect(barrel.default).toBe(barrel['Named']);",
        "  const value = (await import('./value')).default;",
        "}",
      ].join("\n")
    );

    expect(sites.map((site) => [site.specifier, site.wrapped, site.names, site.all])).toEqual([
      ["./api", false, ["load", "save"], false],
      ["./index", false, ["default", "Named"], false],
      ["./value", false, ["default"], false],
    ]);
    expect(sites[0].nameRanges).toEqual(
      new Map([
        ["load", [at(1, 10, 4)]],
        ["save", [at(1, 16, 4)]],
      ])
    );
    expect(sites[1].nameRanges.get("Named")).toEqual([at(3, 37, 7)]);
    expect(sites[1].anchor).toEqual(at(2, 23, 6));
  });

  it("marks side-effect and escaping imports as consuming the whole module", () => {
    const sites = sitesOf(
      [
        "useEffect(() => { import('./polyfill'); }, []);",
        "const mod = await import('./mod');",
        "register(mod);",
      ].join("\n")
    );

    expect(sites.map((site) => [site.specifier, site.wrapped, site.all])).toEqual([
      ["./polyfill", false, true],
      ["./mod", false, true],
    ]);
    expect(sites[0].anchor).toEqual(at(0, 18, 6));
  });

  it("accepts static template literals and skips computed specifiers", () => {
    const sites = sitesOf(
      ["const a = import(`./static`);", "const b = import(`./locales/${lang}.json`);", "const c = import(name);"].join("\n")
    );

    expect(sites.map((site) => site.specifier)).toEqual(["./static"]);
  });

  it("recognises custom identifier matchers", () => {
    setCustomMatchers([{ kind: "named", name: "lazyLoad", source: "@acme/lazy" }]);

    const site = only(
      ["import { lazyLoad } from '@acme/lazy';", "const Widget = lazyLoad(() => import('./widget'));"].join("\n")
    );

    expect(site.wrapped).toBe(true);
    expect(site.names).toEqual(["default"]);
  });
});
