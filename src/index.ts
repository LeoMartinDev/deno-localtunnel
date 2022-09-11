import { Buffer } from "https://deno.land/std@0.155.0/io/buffer.ts";
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

  const c = await Deno.connect({
    port: 8080,
    hostname: "localhost",
    transport: "tcp",
  });

  let timer: number | undefined = undefined;

  let entries: any[] = [];

  const body = new ReadableStream({
    start(controller) {
      timer = setInterval(() => {
        entries.forEach((entry) => {
          controller.enqueue(entry);
        });
        entries = [];
      }, 1000);

      console.log("okok");
    },
    cancel() {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    },
  });

  body.pipeTo(c.writable);

  for await (const chunk of iterateReader(connection)) {
    entries.push(chunk);
  }
}

const { url, port } = await getLocaltunnel("test");

console.log(url);

const localtunnelHostname = new URL(url).hostname;

const server = Deno.listen({ port: 8080 });
console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);

async function startServer() {
  // Connections to the server will be yielded up as an async iterable.
  for await (const conn of server) {
    console.log("in server !!!");
    // In order to not be blocking, we need to handle each connection individually
    // without awaiting the function
    serveHttp(conn);
  }

  async function serveHttp(conn: Deno.Conn) {
    // This "upgrades" a network connection into an HTTP connection.
    const httpConn = Deno.serveHttp(conn);
    // Each request sent over the HTTP connection will be yielded as an async
    // iterator from the HTTP connection.
    for await (const requestEvent of httpConn) {
      // The native HTTP server uses the web standard `Request` and `Response`
      // objects.
      const body = `Your user-agent is:\n\n${
        requestEvent.request.headers.get("user-agent") ?? "Unknown"
      }`;
      // The requestEvent's `.respondWith()` method is how we send the response
      // back to the client.
      requestEvent.respondWith(
        new Response(body, {
          status: 200,
        })
      );
    }
  }
}
startServer();

await startProxying(localtunnelHostname, port);
