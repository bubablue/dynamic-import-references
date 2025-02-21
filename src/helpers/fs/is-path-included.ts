import * as path from "path";

export const isIncluded = (target: string, base: string): boolean => {
  const relPattern = /^(\.\/|\.\.\/)*/;
  const extPattern = /\.[jt]sx?$/;

  const cleanTarget = path.normalize(target).replace(relPattern, "");
  const cleanBase = path.normalize(base).replace(extPattern, "");

  const targetParts = cleanTarget.split(path.sep);
  const baseParts = cleanBase.split(path.sep);

  return (
    baseParts.length === 0 ||
    targetParts.every((part) => baseParts.includes(part))
  );
};
