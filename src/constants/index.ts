import { CustomMatcher } from "../types/customMatchers";

export const DEFAULT_FUNCTION_NAMES = ["dynamic", "lazy", "loadable"];

export const DEFAULT_MATCHERS: CustomMatcher[] = [
  { kind: "named", name: "lazy", source: "react", allowAlias: true },
  { kind: "named", name: "dynamic", source: "next/dynamic", allowAlias: true },
  { kind: "default", source: "next/dynamic", allowAlias: true },
  {
    kind: "named",
    name: "loadable",
    source: "@loadable/component",
    allowAlias: true,
  },
  { kind: "default", source: "@loadable/component", allowAlias: true },
];
