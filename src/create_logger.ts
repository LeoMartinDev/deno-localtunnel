import { log } from "../deps.ts";

export type Logger = log.Logger;

export function createLogger() {
  log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler("DEBUG", {
        formatter: (logRecord) => {
          const { levelName, msg, args } = logRecord;

          const argsString = args.reduce((acc, arg) => {
            if (typeof arg === "object") {
              return `${acc} ${JSON.stringify(arg)}`;
            }
          }, "");

          return `${levelName} ${msg}${argsString ? " ::: " : ""}${argsString}`;
        },
      }),
    },
    loggers: {
      default: {
        level: "DEBUG",
        handlers: ["console"],
      },
    },
  });

  return log.getLogger("localtunnel");
}
