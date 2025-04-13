const findAllMatchingSuffixPrefix = (basePath: string, targetPath: string) => {
  const suffixFragments = basePath.split("/");
  const prefixFragments = targetPath.split("/");

  let matches = [];

  for (
    let i = 1;
    i <= Math.min(suffixFragments.length, prefixFragments.length);
    i++
  ) {
    const suffix = suffixFragments.slice(-i).join("/");
    const prefix = prefixFragments.slice(0, i).join("/");

    if (suffix === prefix) {
      matches.push(suffix);
    }
  }

  return matches.length ? matches?.join() : null;
};

export function removeDuplicateSuffix(
  basePath: string,
  targetPath: string
): string {
  const commonPath = findAllMatchingSuffixPrefix(basePath, targetPath);
  if (commonPath) {
    return basePath.replace(commonPath, "");
  }
  return basePath;
}
