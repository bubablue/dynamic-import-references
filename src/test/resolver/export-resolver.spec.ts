import { ExportTables } from "../../helpers/code/export-tables";
import { ExportResolver } from "../../helpers/resolver/export-resolver";
import { ModuleResolver } from "../../helpers/resolver/module-resolver";
import { createFixture, Fixture } from "../fixtures/create-fixture";

describe("ExportResolver", () => {
  let fixture: Fixture;
  let resolver: ExportResolver;

  const setup = (files: Record<string, string>) => {
    fixture = createFixture(files);
    const tables = new ExportTables();
    resolver = new ExportResolver(new ModuleResolver(), (file) => tables.get(file));
  };

  afterEach(() => fixture.cleanup());

  it("resolves the different shapes of a default export to the declaration", () => {
    setup({
      "fn.tsx": "export default function Page() {}",
      "ident.tsx": "const Card = () => null;\nexport default Card;",
      "memo.tsx": "import { memo } from 'react';\nconst Row = () => null;\nexport default memo(Row) as typeof Row;",
      "anon.tsx": "export default () => null;",
      "spec.tsx": "const Grid = () => null;\nexport { Grid as default };",
    });

    expect(resolver.resolveExport(fixture.file("fn.tsx"), "default")).toEqual({ file: fixture.file("fn.tsx"), name: "Page" });
    expect(resolver.resolveExport(fixture.file("ident.tsx"), "default")).toEqual({ file: fixture.file("ident.tsx"), name: "Card" });
    expect(resolver.resolveExport(fixture.file("memo.tsx"), "default")).toEqual({ file: fixture.file("memo.tsx"), name: "Row" });
    expect(resolver.resolveExport(fixture.file("anon.tsx"), "default")).toEqual({ file: fixture.file("anon.tsx"), name: "default" });
    expect(resolver.resolveExport(fixture.file("spec.tsx"), "default")).toEqual({ file: fixture.file("spec.tsx"), name: "Grid" });
  });

  it("follows barrels and facades to the real declaration", () => {
    setup({
      "widget/ui/banner.tsx": "export default function Banner() {}\nexport const helper = 1;",
      "widget/facade.tsx": "import Banner from './ui/banner';\nexport default Banner;",
      "widget/index.tsx": "export { default } from './facade';\nexport { default as Banner, helper as util } from './ui/banner';",
      "root.ts": "export * from './widget';",
    });
    const banner = { file: fixture.file("widget/ui/banner.tsx"), name: "Banner" };

    expect(resolver.resolveExport(fixture.file("widget/index.tsx"), "default")).toEqual(banner);
    expect(resolver.resolveExport(fixture.file("widget/index.tsx"), "Banner")).toEqual(banner);
    expect(resolver.resolveExport(fixture.file("root.ts"), "util")).toEqual({
      file: fixture.file("widget/ui/banner.tsx"),
      name: "helper",
    });
    expect(resolver.resolveExport(fixture.file("root.ts"), "default")).toBeUndefined();
  });

  it("survives circular re-exports", () => {
    setup({
      "a.ts": "export * from './b';",
      "b.ts": "export * from './a';",
    });

    expect(resolver.resolveExport(fixture.file("a.ts"), "missing")).toBeUndefined();
  });

  it("identifies the symbol under the cursor only when it can be imported", () => {
    setup({
      "card.tsx": "const local = 1;\nexport const Card = () => local;\nexport default Card;",
      "page.tsx": "import Card from './card';\nimport { useState } from 'react';\nexport const Page = () => <Card />;",
    });

    expect(resolver.symbolAt(fixture.file("card.tsx"), "Card")).toEqual({ file: fixture.file("card.tsx"), name: "Card" });
    expect(resolver.symbolAt(fixture.file("card.tsx"), "default")).toEqual({ file: fixture.file("card.tsx"), name: "Card" });
    expect(resolver.symbolAt(fixture.file("card.tsx"), "local")).toBeUndefined();
    expect(resolver.symbolAt(fixture.file("card.tsx"), "unknown")).toBeUndefined();
    expect(resolver.symbolAt(fixture.file("page.tsx"), "Card")).toEqual({ file: fixture.file("card.tsx"), name: "Card" });
    expect(resolver.symbolAt(fixture.file("page.tsx"), "useState")).toEqual({ file: "external:react", name: "useState" });
  });
});
