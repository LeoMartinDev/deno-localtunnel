import { Socket } from "../deps.ts";
import { Logger } from "./create_logger.ts";
import { SocketOptions } from "./types.ts";

export function createTaskHandler(logger: Logger) {
  return async function taskHandler(
    tunnelOptions: SocketOptions,
    appOptions: SocketOptions
  ) {
    logger.debug("taskHandler start");

    await new Promise<void>((resolve, reject) => {
      const socket = new Socket({});

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

        const appSocket = new Socket({});

        appSocket.addListener("connect", () => {
          socket.resume();

          appSocket.pipe(socket);
          socket.pipe(appSocket);
        });

        appSocket.addListener("error", (error: unknown) => {
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
