import { z } from "../deps.ts";
import { Localtunnel } from "./types.ts";

type GetLocaltunnelResponse = {
  id: string;
  port: number;
  url: string;
  max_conn_count: number;
};

function apiResponseToLocaltunnel(apiResponse: GetLocaltunnelResponse) {
  return {
    port: apiResponse.port,
    url: apiResponse.url,
    maxNbConnections: apiResponse.max_conn_count,
    hostname: new URL(apiResponse.url).hostname,
  };
}

function isApiResponseValid(
  apiResponse: unknown
): apiResponse is GetLocaltunnelResponse {
  const schema = z.object({
    id: z.string(),
    port: z.number(),
    url: z.string(),
    max_conn_count: z.number(),
  });

  const { success } = schema.safeParse(apiResponse);

  return success;
}

export async function getLocaltunnelConnectionInfo(
  localtunnelApiUrl: string,
  subdomain?: string
): Promise<Localtunnel> {
  const localtunnelUrl = new URL(subdomain || "", localtunnelApiUrl);

  if (!subdomain) {
    localtunnelUrl.searchParams.append("new", "");
  }

  const response = await fetch(localtunnelUrl);

  const apiResponse = await response.json();

  if (!isApiResponseValid(apiResponse)) {
    throw new Error("Invalid response from localtunnel API");
  }

  return apiResponseToLocaltunnel(apiResponse);
}
