import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const files = [
  ["/demo/", "../demo/index.html", "text/html; charset=utf-8"],
  ["/demo/chat.mjs", "../demo/chat.mjs", "text/javascript; charset=utf-8"],
  ["/sdk/livetime.mjs", "../sdk/livetime.mjs", "text/javascript; charset=utf-8"],
];

const assets = new Map(await Promise.all(files.map(async ([route, file, type]) => [
  route, { bytes: await readFile(new URL(file, import.meta.url)), type },
])));

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const url = new URL(request.url, "http://localhost");
  if (["/", "/demo", "/demo/index.html"].includes(url.pathname)) {
    response.writeHead(302, { Location: "/demo/" + url.search }).end();
    return;
  }

  const asset = assets.get(url.pathname);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, { "Content-Type": asset.type, "Content-Length": asset.bytes.length });
  response.end(request.method === "HEAD" ? undefined : asset.bytes);
});

server.listen(Number(process.env.PORT || 8000), "127.0.0.1", () => {
  console.log(`Livetime chat at http://localhost:${server.address().port}/demo/`);
});
