import * as path from "path";
import { ext_pattern_regex, relative_dir_regex } from "../regexp";

export const isIncluded = (target: string, base: string): boolean => {
  const cleanTarget = path.normalize(target).replace(relative_dir_regex, "");
  const cleanBase = path.normalize(base).replace(ext_pattern_regex, "");

  const targetParts = cleanTarget.split(path.sep);
  const baseParts = cleanBase.split(path.sep);

  return (
    baseParts.length === 0 ||
    targetParts.every((part) => baseParts.includes(part))
  );
};
