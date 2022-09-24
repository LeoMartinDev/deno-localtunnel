import { Logger, PQueue } from "../deps.ts";

import { createLogger } from "./create_logger.ts";
import { createTaskHandler } from "./create_task_handler.ts";
import { getLocaltunnelConnectionInfo } from "./get_localtunnel_connection_info.ts";

type CreateLocalTunnelOptions = {
  subdomain?: string;
  logger?: Logger;
  domain?: string;
};

export async function createLocaltunnel(
  hostname: string,
  port: number,
  options?: CreateLocalTunnelOptions
) {
  const {
    logger = createLogger(),
    subdomain,
    domain = "https://localtunnel.me",
  } = options || {};

  const taskHandler = createTaskHandler(logger);

  const localtunnel = await getLocaltunnelConnectionInfo(domain, subdomain);

  logger.debug("localtunnel connection info", localtunnel);

  const queue = new PQueue({
    concurrency: localtunnel.maxNbConnections,
    autoStart: false,
    timeout: 1000 * 60 * 1, // 1 minute
  });

  queue.addEventListener("next", async () => {
    await queue.add(() =>
      taskHandler(
        {
          hostname: localtunnel.hostname,
          port: localtunnel.port,
        },
        {
          hostname,
          port,
        }
      )
    );
  });

  new Array(localtunnel.maxNbConnections).fill(null).map(() =>
    taskHandler(
      {
        hostname: localtunnel.hostname,
        port: localtunnel.port,
      },
      {
        hostname,
        port,
      }
    )
  );

  queue.start();
}
