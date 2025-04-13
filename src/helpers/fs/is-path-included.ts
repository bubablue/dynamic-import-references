import * as path from "path";

export const extensionPattern = /\.[jt]sx?$/;
const relativePattern = /^(\.\/|\.\.\/)*/;

export const isIncluded = (target: string, base: string): boolean => {
  const cleanTarget = path.normalize(target).replace(relativePattern, "");
  const cleanBase = path.normalize(base).replace(extensionPattern, "");

  const targetParts = cleanTarget.split(path.sep);
  const baseParts = cleanBase.split(path.sep);

  return (
    baseParts.length === 0 ||
    targetParts.every((part) => baseParts.includes(part))
  );
};
