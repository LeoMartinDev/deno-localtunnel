import * as net from "https://deno.land/std@0.156.0/node/net.ts";

import { Logger } from "./get-logger.ts";
import { SocketOptions } from "./types.ts";

export function createTaskHandler(logger: Logger) {
  return async function taskHandler(
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
  };
}
