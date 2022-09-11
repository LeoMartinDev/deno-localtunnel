import { iterateReader } from "../mods.ts";

// const connection = await Deno.connect({
//   port: 443,
//   hostname: "localtunnel.me",
//   transport: "tcp",
// });

// connection.setKeepAlive(true);

// // const buffer = new Uint8Array(1024);
// // await connection.read(buffer);

// // console.log(buffer.toString());

// console.log("connected");

// for await (const chunk of iterateReader(connection, { bufSize: 8 })) {
//   console.log(chunk);
// }

type GetLocaltunnelResponse = {
  id: string;
  port: number;
  url: string;
  max_conn_count: number;
};

async function getLocaltunnel(
  subdomain?: string
): Promise<GetLocaltunnelResponse> {
  const url = new URL(subdomain || "", "https://localtunnel.me");

  if (!subdomain) {
    url.searchParams.append("new", "");
  }

  const response = await fetch(url);

  return response.json();
}

async function startProxying(hostname: string, port: number) {
  const connection = await Deno.connect({
    port,
    hostname,
  });

  connection.setKeepAlive(true);

  for await (const chunk of iterateReader(connection)) {
    console.log(chunk.toString());
  }
}

const { url, port } = await getLocaltunnel("test");

console.log(url);

const localtunnelHostname = new URL(url).hostname;

await startProxying(localtunnelHostname, port);
