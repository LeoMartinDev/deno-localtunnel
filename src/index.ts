import PQueue from "https://deno.land/x/p_queue@1.0.1/mod.ts";
import * as log from "https://deno.land/std@0.155.0/log/mod.ts";
import * as net from "https://deno.land/std@0.137.0/node/net.ts";

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
  tunnelConnection: Deno.Conn,
  appConnection: Deno.Conn
) {
  logger.debug("taskHandler start");

  const tunnelSocket = net.createConnection({
    port,
    host: hostname,
  });

  tunnelSocket.pause();

  tunnelSocket.on("readable", () => {
    const appSocket = net.createConnection({
      port: 8080,
      host: "localhost",
    });

    appSocket.pause();

    appSocket.on("readable", () => {
      appSocket.pipe(tunnelSocket);
      tunnelSocket.pipe(appSocket);
    });

    appSocket.on("error", (error) => {
      logger.error("appSocket error", { error });
    });

    tunnelSocket.resume();
    appSocket.resume();
  });

  const appToTunnel = async () => {
    // for await (const chunk of streams.iterateReader(appConnection)) {
    //   tunnelConnection.write(chunk);
    // }
    try {
      await appConnection.readable.pipeTo(tunnelConnection.writable);
    } catch (error) {
      logger.error("appToTunnel error", { error });
    }
  };

  const tunnelToApp = async () => {
    // let logged = false;
    // for await (const chunk of streams.iterateReader(tunnelConnection)) {
    //   if (!logged) {
    //     logger.info("tunnel connected");
    //     logged = true;
    //   }
    //   appConnection.write(chunk);
    // }
    try {
      await tunnelConnection.readable.pipeTo(appConnection.writable);
    } catch (error) {
      logger.error("tunnelToApp error", { error });
    }
  };

  await Promise.all([appToTunnel(), tunnelToApp()]);

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

async function addToQueue() {
  let tunnelConnection: Deno.Conn | null = null;
  let appConnection: Deno.Conn | null = null;

  try {
    [tunnelConnection, appConnection] = await Promise.all([
      Deno.connect({ hostname, port, transport: "tcp" }),
      Deno.connect({ hostname: "localhost", port: 8080, transport: "tcp" }),
    ]);

    await queue.add(() => taskHandler(tunnelConnection!, appConnection!));
  } catch (error) {
    console.error(error);
    // logger.error("taskHandler error", { error });
  } finally {
  }
}

queue.addEventListener("next", () => {
  addToQueue();
});

new Array(maxNbConnections).fill(null).map(() => addToQueue());

await waitForConnections();

logger.info("Connected");
