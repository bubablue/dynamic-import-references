import { DEFAULT_FUNCTION_NAMES } from "../constants";
import { CustomMatcher } from "../types/customMatchers";

export const ts_declare_regex =
  /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class)?\s*(\w+)/g;

let customMatchers: CustomMatcher[] = [];

/**
 * Set custom matchers for regex generation
 * @param matchers - Array of custom matcher configurations
 */
export function setRegexCustomMatchers(matchers: CustomMatcher[]): void {
  customMatchers = matchers;
}

/**
 * Get all function names from built-in and custom matchers
 * @returns Array of function names to match
 */
function getAllFunctionNames(): string[] {
  const customNames = customMatchers
    .filter(
      (matcher) =>
        (matcher.kind === "named" || matcher.kind === "identifier") &&
        matcher.name
    )
    .map((matcher) => matcher.name!)
    .filter(Boolean);

  // Also include member access patterns (e.g., React.lazy -> lazy)
  const memberNames = customMatchers
    .filter((matcher) => matcher.kind === "member" && matcher.member)
    .map((matcher) => matcher.member!)
    .filter(Boolean);

  // Include back-compat memberAccess patterns
  const memberAccessNames = customMatchers
    .filter((matcher) => matcher.memberAccess && matcher.name)
    .map((matcher) => matcher.name!)
    .filter(Boolean);

  const allNames = [
    ...DEFAULT_FUNCTION_NAMES,
    ...customNames,
    ...memberNames,
    ...memberAccessNames,
  ];

  return [...new Set(allNames)].map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
}

/**
 * Generate dynamic regex for detecting dynamic imports
 * Uses [\s\S] instead of . to match newlines for multiline imports
 * Handles block comments inside import() calls
 * @returns Regex pattern for dynamic imports
 */
export function getTsxDynamicRegex(): RegExp {
  const functionNames = getAllFunctionNames();
  const pattern = `(${functionNames.join(
    "|"
  )})\\s*\\([\\s\\S]*?import\\s*\\(\\s*(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*['"']([^'"]+)['"']\\s*\\)`;
  return new RegExp(pattern, "gi");
}

/**
 * Generate dynamic regex for full dynamic import declarations
 * Uses [\s\S] instead of . to match newlines for multiline imports
 * Handles block comments inside import() calls
 * @returns Regex pattern for full dynamic import declarations
 */
export function getTsxFullDynamicRegex(): RegExp {
  const functionNames = getAllFunctionNames();
  const pattern = `(const|let|var|function)\\s+(\\w+)\\s*=\\s*(?:${functionNames.join(
    "|"
  )})\\s*\\([\\s\\S]*?import\\s*\\(\\s*(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*['"']([^'"]+)['"']\\s*\\)`;
  return new RegExp(pattern, "gi");
}

export const tsx_dynamic_regex = getTsxDynamicRegex();
export const tsx_full_dynamic_regex = getTsxFullDynamicRegex();

export const ext_pattern_regex = /\.(m?js|m?ts|jsx|tsx)$/;

export const index_pattern_regex = /index(\.(ts|tsx|js|jsx|mjs|cjs))?$/;

export const relative_dir_regex = /^(\.\/|\.\.\/)*/;

export const extensions = [".tsx", ".ts", ".jsx", ".js"];
