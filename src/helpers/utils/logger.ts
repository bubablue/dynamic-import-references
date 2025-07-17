const DEFAULT_LOG_PREFIX = "DYNAMIC IMPORT DEBUG";

const LOGGING_ENABLED = process.env.NODE_ENV === "development";

export class Logger {
  private readonly prefix: string;

  constructor(prefix: string = DEFAULT_LOG_PREFIX) {
    this.prefix = prefix;
  }

  debug(message: string, ...args: any[]): void {
    if (!LOGGING_ENABLED) {
      return;
    }
    console.log(`${this.prefix} - ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    if (!LOGGING_ENABLED) {
      return;
    }
    console.warn(`${this.prefix} - ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    if (!LOGGING_ENABLED) {
      return;
    }
    console.error(`${this.prefix} - ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    if (!LOGGING_ENABLED) {
      return;
    }
    console.info(`${this.prefix} - ${message}`, ...args);
  }

  withPrefix(prefix: string): Logger {
    return new Logger(prefix);
  }
}

export const log = new Logger();
