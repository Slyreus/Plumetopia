import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "8000", 10);

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Méthode non autorisée");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    sendText(response, 400, "Requête invalide");
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(response, 403, "Accès interdit");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("not-a-file");

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStats.size,
      "Content-Type": CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).on("error", () => response.destroy()).pipe(response);
  } catch {
    sendText(response, 404, "Fichier introuvable");
  }
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, HOST, () => {
  console.log(`Plumetopia est disponible sur http://${HOST}:${PORT}/`);
});
