import PQueue from "https://deno.land/x/p_queue@1.0.1/mod.ts";
import { getLogger, Logger } from "https://deno.land/std@0.157.0/log/mod.ts";

import { getLocaltunnelConnectionInfo } from "./get-localtunnel-connection-info.ts";
import { createTaskHandler } from "./create-task-handler.ts";

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
    logger = await getLogger(),
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
