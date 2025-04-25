export const ts_declare_regex =
  /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class)?\s*(\w+)/g;

export const tsx_dynamic_regex =
  /(dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;

export const tsx_full_dynamic_regex =
  /(const|let|var|function)\s+(\w+)\s*=\s*(?:dynamic|lazy)\s*\(\s*\(\s*.*?\s*=>\s*import\(['"](.+?)['"]\)/gi;

export const ext_pattern_regex = /\.(m?js|m?ts|jsx|tsx)$/;

export const relative_dir_regex = /^(\.\/|\.\.\/)*/;

export const extensions = [".tsx", ".ts", ".jsx", ".js"];
