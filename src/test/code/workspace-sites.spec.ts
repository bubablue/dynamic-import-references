import * as fs from "node:fs";
import * as vscode from "vscode";
import { ExportTables } from "../../helpers/code/export-tables";
import { extractImportSites, WorkspaceSites } from "../../helpers/code/workspace-sites";
import { createFixture, Fixture } from "../fixtures/create-fixture";

describe("extractImportSites", () => {
  it("skips files without dynamic imports", () => {
    expect(extractImportSites("import a from './a';\nexport default a;")).toEqual([]);
  });

  it("skips files that cannot be parsed", () => {
    expect(extractImportSites("const = import('./a') <<<")).toEqual([]);
  });

  it("returns sites for files with dynamic imports", () => {
    expect(extractImportSites("const a = import('./a');").map((site) => site.specifier)).toEqual(["./a"]);
  });
});

describe("WorkspaceSites", () => {
  let fixture: Fixture;
  let readSpy: jest.SpyInstance;

  beforeEach(() => {
    fixture = createFixture({
      "page.ts": "const a = import('./a');",
      "plain.ts": "export const x = 1;",
    });
    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
      { fsPath: fixture.file("page.ts") },
      { fsPath: fixture.file("plain.ts") },
    ]);
    readSpy = jest.spyOn(fs.promises, "readFile");
  });

  afterEach(() => {
    readSpy.mockRestore();
    fixture.cleanup();
    jest.clearAllMocks();
  });

  it("scans the workspace once and keeps only files with dynamic imports", async () => {
    const sites = new WorkspaceSites();

    const first = await sites.snapshot();
    const second = await sites.snapshot();

    expect([...first.keys()]).toEqual([fixture.file("page.ts")]);
    expect(second).toBe(first);
    expect(vscode.workspace.findFiles).toHaveBeenCalledTimes(1);
    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  it("re-reads only the files reported as changed", async () => {
    const sites = new WorkspaceSites();
    await sites.snapshot();
    readSpy.mockClear();

    fixture.write("plain.ts", "export const load = () => import('./b');");
    sites.markChanged(fixture.file("plain.ts"));
    const snapshot = await sites.snapshot();

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(snapshot.get(fixture.file("plain.ts"))?.map((site) => site.specifier)).toEqual(["./b"]);
  });

  it("ignores changes before the first scan and inside excluded folders", async () => {
    const sites = new WorkspaceSites();
    sites.markChanged(fixture.file("page.ts"));
    await sites.snapshot();
    readSpy.mockClear();

    sites.markChanged(fixture.file("node_modules/pkg/index.js"));
    await sites.snapshot();

    expect(readSpy).not.toHaveBeenCalled();
  });

  it("keeps the list of workspace files current", async () => {
    const sites = new WorkspaceSites();
    expect(sites.knownFiles()).toBeUndefined();
    await sites.snapshot();

    fixture.write("added.ts", "export const added = 1;");
    sites.markChanged(fixture.file("added.ts"));
    sites.markDeleted(fixture.file("plain.ts"));

    expect([...(sites.knownFiles() ?? [])].sort()).toEqual([fixture.file("added.ts"), fixture.file("page.ts")]);
  });

  it("drops deleted files", async () => {
    const sites = new WorkspaceSites();
    await sites.snapshot();

    sites.markDeleted(fixture.file("page.ts"));

    expect((await sites.snapshot()).size).toBe(0);
  });
});

describe("ExportTables", () => {
  let fixture: Fixture;

  afterEach(() => fixture.cleanup());

  it("parses a file once until it is invalidated", () => {
    fixture = createFixture({ "card.ts": "export const Card = 1;" });
    const tables = new ExportTables();

    const first = tables.get(fixture.file("card.ts"));
    fixture.write("card.ts", "export const Other = 1;");
    expect(tables.get(fixture.file("card.ts"))).toBe(first);

    tables.delete(fixture.file("card.ts"));
    expect([...(tables.get(fixture.file("card.ts"))?.named.keys() ?? [])]).toEqual(["Other"]);
  });

  it("returns undefined for missing or unparsable files", () => {
    fixture = createFixture({ "broken.ts": "export const = <<<" });
    const tables = new ExportTables();

    expect(tables.get(fixture.file("missing.ts"))).toBeUndefined();
    expect(tables.get(fixture.file("broken.ts"))).toBeUndefined();
  });
});
