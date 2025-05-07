import * as path from "path";
import {
  ext_pattern_regex,
  index_pattern_regex,
  relative_dir_regex,
} from "../regexp";

const normalizeAndClean = (input: string) => {
  const extension = path.normalize(input).replace(ext_pattern_regex, "");
  const relativeDir = extension.replace(relative_dir_regex, "");
  const basename = path.basename(relativeDir);
  const dirname = path.dirname(relativeDir);

  const normalized = index_pattern_regex.test(basename) ? dirname : relativeDir;

  return normalized.split(path.sep).filter(Boolean);
};

export const isIncluded = (target: string, base: string): boolean => {
  const targetParts = normalizeAndClean(target);
  const baseParts = normalizeAndClean(base);

  const included =
    targetParts.every((part) => baseParts.includes(part)) &&
    baseParts?.[baseParts.length - 1] === targetParts?.[targetParts.length - 1];

  return baseParts.length === 0 || included;
};
