/**
 * Interface for custom matcher configuration
 */
export interface CustomMatcher {
  /** How the function is referenced */
  kind: "named" | "default" | "member" | "identifier";
  /** Function or identifier name to detect (required for named, member, identifier) */
  name?: string;
  /** Module specifier used in import statements (required for named, default, member) */
  source?: string;
  /** Namespace identifier when kind = 'member' (e.g. 'R' in R.lazy) */
  namespace?: string;
  /** Member function name when kind = 'member' (e.g. 'lazy' in R.lazy) */
  member?: string;
  /** Allow matches even if the import is aliased */
  allowAlias?: boolean;
  /** Require the function to be imported from a module rather than declared locally */
  requireImport?: boolean;
  /** Back-compat: allow member access patterns */
  memberAccess?: boolean;
}

/**
 * Configuration interface for custom matchers
 */
export interface CustomMatchersConfig {
  customMatchers: CustomMatcher[];
}