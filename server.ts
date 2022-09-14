export async function startServer() {
  const server = Deno.listen({ port: 8080 });
  console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);

  // Connections to the server will be yielded up as an async iterable.
  for await (const conn of server) {
    serveHttp(conn);
  }

  async function serveHttp(conn: Deno.Conn) {
    // This "upgrades" a network connection into an HTTP connection.
    const httpConn = Deno.serveHttp(conn);
    // Each request sent over the HTTP connection will be yielded as an async
    // iterator from the HTTP connection.
    for await (const requestEvent of httpConn) {
      try {
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
      } catch (error) {
        console.log("HTTP server error", error);
      }
    }
  }
}
