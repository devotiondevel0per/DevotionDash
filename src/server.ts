/**
 * Custom production server for ZedDash.
 * Supports plain HTTP and direct HTTPS with SSL cert files.
 *
 * Environment variables:
 *   PORT          – port for main server (default: 3000)
 *   SSL_CERT_PATH – absolute path to SSL certificate file (.crt / .pem)
 *   SSL_KEY_PATH  – absolute path to SSL private key file (.key / .pem)
 *   FORCE_HTTPS   – "true" to also start an HTTP redirect server (port HTTP_PORT)
 *   HTTP_PORT     – port for the HTTP→HTTPS redirect listener (default: 80)
 *   NODE_ENV      – set to "production"
 *
 * Usage:
 *   node dist/server.js           (HTTP, port 3000)
 *   node dist/server.js           (HTTPS if SSL_CERT_PATH + SSL_KEY_PATH are set)
 */

import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import { parse } from "url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const httpPort = parseInt(process.env.HTTP_PORT ?? "80", 10);
const certPath = process.env.SSL_CERT_PATH ?? "";
const keyPath = process.env.SSL_KEY_PATH ?? "";
const forceHttps = process.env.FORCE_HTTPS === "true";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

// Keep Server Actions decryption key stable across restarts/deploys.
// Without this, users with an old tab can hit "Failed to find Server Action"
// after deployment because action payloads can no longer be decrypted.
if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY && process.env.AUTH_SECRET) {
  process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = process.env.AUTH_SECRET;
  process.stdout.write("[server] NEXT_SERVER_ACTIONS_ENCRYPTION_KEY was not set; using AUTH_SECRET fallback.\n");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function log(msg: string) {
  process.stdout.write(`[server] ${msg}\n`);
}

app.prepare().then(() => {
  const useHttps = Boolean(certPath && keyPath);

  if (useHttps) {
    if (!existsSync(certPath)) {
      log(`ERROR: SSL_CERT_PATH not found: ${certPath}`);
      process.exit(1);
    }
    if (!existsSync(keyPath)) {
      log(`ERROR: SSL_KEY_PATH not found: ${keyPath}`);
      process.exit(1);
    }

    const cert = readFileSync(certPath);
    const key = readFileSync(keyPath);

    const httpsServer = createHttpsServer({ cert, key, maxHeaderSize: 65536 }, async (req, res) => {
      try {
        const parsedUrl = parse(req.url ?? "/", true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Request handling error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    httpsServer.listen(port, hostname, () => {
      log(`✓ HTTPS server running on https://${hostname}:${port}`);
    });

    if (forceHttps) {
      const redirectServer = createHttpServer((req, res) => {
        const host = (req.headers.host ?? "localhost").split(":")[0];
        const target = port === 443 ? `https://${host}${req.url}` : `https://${host}:${port}${req.url}`;
        res.writeHead(301, { Location: target });
        res.end();
      });
      redirectServer.listen(httpPort, hostname, () => {
        log(`✓ HTTP→HTTPS redirect listening on port ${httpPort}`);
      });
    }
  } else {
    const httpServer = createHttpServer({ maxHeaderSize: 65536 }, async (req, res) => {
      try {
        const parsedUrl = parse(req.url ?? "/", true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Request handling error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    httpServer.listen(port, hostname, () => {
      log(`✓ HTTP server running on http://${hostname}:${port}`);
      if (!certPath && !keyPath) {
        log("  Tip: set SSL_CERT_PATH + SSL_KEY_PATH env vars to enable HTTPS");
      }
    });
  }
}).catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
