import PQueue from "https://deno.land/x/p_queue@1.0.1/mod.ts";
import * as log from "https://deno.land/std@0.155.0/log/mod.ts";

import { startServer } from "../server.ts";

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: (logRecord) => {
        const { levelName, msg, args } = logRecord;

        const argsString = args.reduce((acc, arg) => {
          if (typeof arg === "object") {
            return `${acc} ${JSON.stringify(arg)}`;
          }
        }, "");

        return `${levelName} ${msg} ::: ${argsString}`;
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

const logger = log.getLogger();

startServer();

type GetLocaltunnelResponse = {
  id: string;
  port: number;
  url: string;
  maxNbConnections: number;
};

type Localtunnel = {
  port: number;
  url: string;
  maxNbConnections: number;
  hostname: string;
};

async function getLocaltunnel(subdomain?: string): Promise<Localtunnel> {
  const localtunnelUrl = new URL(subdomain || "", "https://localtunnel.me");

  if (!subdomain) {
    localtunnelUrl.searchParams.append("new", "");
  }

  const response = await fetch(localtunnelUrl);

  const { port, url, max_conn_count } = await response.json();

  return {
    port,
    url,
    maxNbConnections: max_conn_count,
    hostname: new URL(url).hostname,
  };
}

const { url, port, maxNbConnections, hostname } = await getLocaltunnel(
  "trompette-deluxe"
);

logger.info("localtunnel", {
  url,
  port,
  maxNbConnections,
});

function waitForConnection(hostname: string, port: number): Promise<Deno.Conn> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        logger.info("Trying to connect to localtunnel", { hostname, port });
        const conn = await Deno.connect({ hostname, port });
        clearInterval(interval);
        resolve(conn);
      } catch (error) {
        logger.error(error);
        if (error instanceof Deno.errors.ConnectionRefused) {
          return;
        }
        clearInterval(interval);
        reject(error);
      }
    }, 1000);
  });
}

await Promise.all([
  waitForConnection(hostname, port),
  waitForConnection("localhost", 8080),
]);

logger.info("Connected");

const queue = new PQueue({
  concurrency: maxNbConnections,
  autoStart: true,
});

async function taskHandler() {
  const tunnelConnection = await Deno.connect({
    port,
    hostname: url,
    transport: "tcp",
  });

  const appConnection = await Deno.connect({
    port: 8080,
    hostname: "localhost",
    transport: "tcp",
  });

  tunnelConnection.readable.pipeTo(appConnection.writable);
  appConnection.readable.pipeTo(tunnelConnection.writable);
}

async function addToQueue() {
  try {
    await queue.add(taskHandler);
  } catch (error) {
    if (error instanceof Deno.errors.ConnectionRefused) {
      queue.pause();
    }
    console.error(error);
  }
}

queue.addEventListener("next", () => {
  addToQueue();
});

for (let i = 0; i < maxNbConnections; i++) {
  addToQueue();
}

queue.start();
