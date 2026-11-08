import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Fixture {
  root: string;
  file(relativePath: string): string;
  write(relativePath: string, content: string): void;
  cleanup(): void;
}

export function createFixture(files: Record<string, string>): Fixture {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "dynamic-import-references-"))
  );
  const file = (relativePath: string) => path.join(root, relativePath);
  const write = (relativePath: string, content: string) => {
    fs.mkdirSync(path.dirname(file(relativePath)), { recursive: true });
    fs.writeFileSync(file(relativePath), content);
  };

  for (const [relativePath, content] of Object.entries(files)) {
    write(relativePath, content);
  }

  return {
    root,
    file,
    write,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
