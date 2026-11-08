import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import { log } from "../utils/logger";

export function parseCodeToAST(text: string) {
  try {
    return babelParser.parse(text, {
      sourceType: "unambiguous",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        "jsx",
        "typescript",
        "decorators-legacy",
        "functionBind",
        "exportDefaultFrom",
      ],
      ranges: true,
    });
  } catch (error) {
    log.warn("Primary parsing failed, trying fallback:", error);
    try {
      return babelParser.parse(text, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
        ranges: true,
      });
    } catch (fallbackError) {
      log.warn("Fallback parsing failed:", fallbackError);
      throw fallbackError;
    }
  }
}

export { traverse };
