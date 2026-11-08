import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DynamicReferenceProvider } from "../dynamicReferenceProvider";
import { createFixture, Fixture } from "./fixtures/create-fixture";

const PROJECT = {
  "tsconfig.base.json": `{
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "~/shop/widgets/*": ["apps/shop/src/widgets/*"] }
    }
  }`,
  "apps/shop/tsconfig.json": `{ "extends": "../../tsconfig.base.json" }`,
  "apps/shop/src/widgets/banner/ui/banner.tsx": [
    "export default function Banner() {",
    "  return null;",
    "}",
    "export const helper = () => 1;",
  ].join("\n"),
  "apps/shop/src/widgets/banner/index.tsx": "export { default } from './ui/banner';",
  "apps/shop/src/pages/home.tsx": [
    "import dynamic from 'next/dynamic';",
    "const LazyBanner = dynamic(() => import('~/shop/widgets/banner'));",
    "export const Home = () => <LazyBanner />;",
  ].join("\n"),
  "apps/shop/src/pages/views.tsx": [
    "import dynamic from 'next/dynamic';",
    "export const Views = {",
    "  banner: dynamic<object>(() => import('../widgets/banner/ui/banner'), { ssr: false }),",
    "  other: dynamic(() => import('../widgets/other')),",
    "};",
  ].join("\n"),
  "apps/shop/src/pages/named.tsx": "export const load = () => import('../widgets/banner/ui/banner').then((m) => m.helper);",
  "apps/shop/src/widgets/banner/__tests__/index.spec.tsx": [
    "it('re-exports', async () => {",
    "  const barrel = await import('../index');",
    "  expect(barrel.default).toBeDefined();",
    "});",
  ].join("\n"),
  "apps/shop/src/widgets/other.tsx": "export default function Other() { return null; }",
  "apps/shop/src/pages/static.tsx": "import Banner from '~/shop/widgets/banner';\nexport const Static = () => <Banner />;",
};

describe("DynamicReferenceProvider", () => {
  let fixture: Fixture;
  let provider: DynamicReferenceProvider;
  const token = { isCancellationRequested: false } as vscode.CancellationToken;

  const documentFor = (relativePath: string, word: string, unsavedText?: string) => {
    const fsPath = fixture.file(relativePath);
    return {
      uri: { fsPath },
      isDirty: unsavedText !== undefined,
      getWordRangeAtPosition: jest.fn().mockReturnValue({}),
      getText: jest.fn((range?: unknown) => (range ? word : unsavedText ?? fs.readFileSync(fsPath, "utf8"))),
    } as unknown as vscode.TextDocument;
  };

  const find = async (relativePath: string, word: string, unsavedText?: string) => {
    const locations = await provider.provideReferences(
      documentFor(relativePath, word, unsavedText),
      {} as vscode.Position,
      { includeDeclaration: true },
      token
    );
    type MockRange = { start: { line: number; char: number }; end: { line: number; char: number } };
    return (locations as unknown as { uri: { fsPath: string }; position: MockRange }[])
      .map(({ uri, position: { start, end } }) => {
        const file = path.relative(fixture.root, uri.fsPath);
        return `${file}:${start.line + 1}:${start.char + 1}-${end.char + 1}`;
      })
      .sort();
  };

  beforeEach(() => {
    fixture = createFixture(PROJECT);
    provider = new DynamicReferenceProvider();
    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(
      Object.keys(PROJECT)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => ({ fsPath: fixture.file(file) }))
    );
  });

  afterEach(() => {
    fixture.cleanup();
    jest.clearAllMocks();
  });

  it("finds wrappers, object maps and barrel accesses that load the declaration", async () => {
    expect(await find("apps/shop/src/widgets/banner/ui/banner.tsx", "Banner")).toEqual([
      "apps/shop/src/pages/home.tsx:2:20-27",
      "apps/shop/src/pages/home.tsx:3:28-38",
      "apps/shop/src/pages/views.tsx:3:11-18",
      "apps/shop/src/widgets/banner/__tests__/index.spec.tsx:2:24-30",
    ]);
  });

  it("gives the same answer when invoked from a file that imports the symbol", async () => {
    expect(await find("apps/shop/src/pages/static.tsx", "Banner")).toEqual(
      await find("apps/shop/src/widgets/banner/ui/banner.tsx", "Banner")
    );
  });

  it("reports named accesses on the exact identifier range so editors can merge them with TypeScript", async () => {
    expect(await find("apps/shop/src/widgets/banner/ui/banner.tsx", "helper")).toEqual([
      "apps/shop/src/pages/named.tsx:1:79-85",
    ]);
  });

  it("ignores imports of other modules", async () => {
    expect(await find("apps/shop/src/widgets/other.tsx", "Other")).toEqual([
      "apps/shop/src/pages/views.tsx:4:10-17",
    ]);
  });

  it("picks up saved changes once the file is reported as changed", async () => {
    await find("apps/shop/src/widgets/other.tsx", "Other");
    fixture.write("apps/shop/src/pages/views.tsx", "export const none = 1;");

    expect(await find("apps/shop/src/widgets/other.tsx", "Other")).toHaveLength(1);
    provider.fileChanged(fixture.file("apps/shop/src/pages/views.tsx"));
    expect(await find("apps/shop/src/widgets/other.tsx", "Other")).toEqual([]);
  });

  it("reads exports of the current document from its unsaved buffer", async () => {
    expect(
      await find("apps/shop/src/widgets/other.tsx", "Other", "function Other() { return null; }")
    ).toEqual([]);
  });

  it("skips the workspace scan for symbols that cannot be imported", async () => {
    (vscode.workspace.findFiles as jest.Mock).mockClear();
    expect(await find("apps/shop/src/pages/home.tsx", "LazyBanner")).toEqual([]);
    expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
  });

  it("returns nothing without a word under the cursor", async () => {
    const document = {
      getWordRangeAtPosition: jest.fn().mockReturnValue(undefined),
    } as unknown as vscode.TextDocument;

    await expect(
      provider.provideReferences(document, {} as vscode.Position, { includeDeclaration: true }, token)
    ).resolves.toEqual([]);
  });

  it("returns nothing once the request is cancelled", async () => {
    const cancelled = { isCancellationRequested: true } as vscode.CancellationToken;

    await expect(
      provider.provideReferences(
        documentFor("apps/shop/src/widgets/banner/ui/banner.tsx", "Banner"),
        {} as vscode.Position,
        { includeDeclaration: true },
        cancelled
      )
    ).resolves.toEqual([]);
  });
});
