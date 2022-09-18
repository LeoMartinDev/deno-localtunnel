import PQueue from "https://deno.land/x/p_queue@1.0.1/mod.ts";
import * as log from "https://deno.land/std@0.155.0/log/mod.ts";
import * as net from "https://deno.land/std@0.137.0/node/net.ts";
import * as streams from "https://deno.land/std@0.156.0/io/streams.ts";

import { startServer } from "../server.ts";
import { resolve } from "https://deno.land/std@0.137.0/path/win32.ts";

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

const logger = log.getLogger();

startServer();

type SocketOptions = {
  hostname: string;
  port: number;
};

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

const promiseRetry = async <T>(
  fn: () => Promise<T>,
  retriesLeft = 5,
  interval = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retriesLeft === 1) {
      throw error;
    } else {
      await new Promise((resolve) => setTimeout(resolve, interval));
      return promiseRetry(fn, retriesLeft - 1, interval);
    }
  }
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

const { url, port, maxNbConnections, hostname } = await getLocaltunnel();

logger.info("localtunnel", {
  url,
  port,
  maxNbConnections,
});

function waitForConnection(hostname: string, port: number): Promise<void> {
  return promiseRetry(
    async () => {
      logger.debug("waiting for connection", { hostname, port });
      const connection = await Deno.connect({ hostname, port });

      connection.close();
    },
    25,
    1000
  );
}

const queue = new PQueue({
  concurrency: maxNbConnections,
  autoStart: false,
});

async function taskHandler(
  tunnelOptions: SocketOptions,
  appOptions: SocketOptions
) {
  logger.debug("taskHandler start");

  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket({});

    socket.setKeepAlive(true);

    socket.addListener("connect", () => {
      if (socket.destroyed) {
        return reject();
      }

      const remoteCloseListener = () => {
        logger.debug("socket close");
        appSocket.destroy();
        resolve();
      };

      socket.addListener("close", remoteCloseListener);

      socket.pause();

      const appSocket = new net.Socket({});

      appSocket.addListener("connect", () => {
        socket.resume();

        appSocket.pipe(socket);
        socket.pipe(appSocket);
      });

      appSocket.addListener("error", (error) => {
        logger.error("appSocket error", { error });

        appSocket.end();

        socket.removeListener("close", remoteCloseListener);

        console.log(error);

        // if (error?.code !== "ECONNREFUSED" && error?.code !== "ECONNRESET") {
        //   socket.end();

        //   reject(error);
        // }

        // retry local app connection
      });

      appSocket.addListener("close", () => {
        logger.debug("appSocket close");
        socket.destroy();
        resolve();
      });

      appSocket.connect(appOptions.port, appOptions.hostname);
    });

    socket.connect(tunnelOptions.port, tunnelOptions.hostname);
  });

  logger.debug("taskHandler end");
}

const waitForConnections = async () => {
  queue.pause();

  await Promise.all([
    waitForConnection(hostname, port),
    waitForConnection("localhost", 8080),
  ]);

  queue.start();
};

async function addToQueue(
  tunnelOptions: SocketOptions,
  appOptions: SocketOptions
) {
  await queue.add(() => taskHandler(tunnelOptions, appOptions));
}

queue.addEventListener("next", () => {
  addToQueue(
    {
      hostname,
      port,
    },
    {
      hostname: "localhost",
      port: 8080,
    }
  );
});

new Array(maxNbConnections).fill(null).map(() =>
  addToQueue(
    {
      hostname,
      port,
    },
    {
      hostname: "localhost",
      port: 8080,
    }
  )
);

await waitForConnections();

logger.info("Connected");
