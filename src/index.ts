import PQueue from "https://deno.land/x/p_queue@1.0.1/mod.ts";
import * as log from "https://deno.land/std@0.155.0/log/mod.ts";
import * as net from "https://deno.land/std@0.156.0/node/net.ts";

import { promiseRetry } from "./utils/promise-retry.ts";
import { getLocaltunnelConnectionInfo } from "./get-localtunnel-connection-info.ts";

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

// startServer();

type SocketOptions = {
  hostname: string;
  port: number;
};

type Localtunnel = {
  port: number;
  url: string;
  maxNbConnections: number;
  hostname: string;
};

const { url, port, maxNbConnections, hostname } =
  await getLocaltunnelConnectionInfo("https://localtunnel.me", "test");

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
  timeout: 1000 * 60 * 1, // 1 minute
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
        return reject(new Error("Socket destroyed"));
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

      appSocket.addListener("error", (error: any) => {
        logger.error("appSocket error", { error });

        appSocket.end();

        socket.removeListener("close", remoteCloseListener);

        // if (error.code! !== "ECONNREFUSED" && error.code! !== "ECONNRESET") {
        //   socket.end();

        //   return reject(error);
        // }

        socket.end();

        reject(error);
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
  try {
    await queue.add(() => taskHandler(tunnelOptions, appOptions));
  } catch (error) {
    logger.error("addToQueueError", { error });
  }
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
