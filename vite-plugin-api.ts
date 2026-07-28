import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env into process.env so API handlers can read it
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, "..", ".env");
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found — handlers will throw if GEMINI_API_KEY is missing
  }
}
loadEnv();

const HANDLER_MAP: Record<string, string> = {
  "/chat-with-lecture": "./chat-with-lecture.ts",
  "/process-lecture": "./process-lecture.ts",
  "/generate-quiz": "./generate-quiz.ts",
  "/cluster-concepts": "./cluster-concepts.ts",
  "/health": "./health.ts",
};

const handlerCache: Record<string, any> = {};

async function loadHandler(route: string): Promise<((req: any, res: any) => Promise<void>) | null> {
  const rel = HANDLER_MAP[route];
  if (!rel) return null;
  if (handlerCache[route]) return handlerCache[route];

  const filePath = pathToFileURL(path.resolve(__dirname, rel)).href;
  const mod = await import(filePath);
  handlerCache[route] = mod.default;
  return mod.default;
}

function collectBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
    });
  });
}

function createVercelRes(res: ServerResponse) {
  let headersSent = false;
  const headers: Record<string, string> = {};
  const vRes: any = {
    _statusCode: 200,
    status(code: number) { vRes._statusCode = code; return vRes; },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; return vRes; },
    json(data: any) {
      const finalHeaders = { "Content-Type": "application/json", ...headers };
      res.writeHead(vRes._statusCode, finalHeaders);
      headersSent = true;
      res.end(JSON.stringify(data));
    },
    write(chunk: any) {
      if (!headersSent) {
        res.writeHead(vRes._statusCode, headers);
        headersSent = true;
      }
      return res.write(chunk);
    },
    end(data?: any) {
      if (!headersSent) {
        res.writeHead(vRes._statusCode, headers);
        headersSent = true;
      }
      res.end(data);
    },
    writeHead(code: number, hdrs?: Record<string, string>) {
      vRes._statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
      return vRes;
    },
  };
  return vRes;
}

export function apiPlugin(): Plugin {
  return {
    name: "vite-plugin-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req: IncomingMessage, res: ServerResponse) => {
        const urlPath = (req.url || "/").split("?")[0];

        if (urlPath === "/") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        const handler = await loadHandler(urlPath);
        if (!handler) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown route: ${urlPath}` }));
          return;
        }

        try {
          const body = await collectBody(req);
          const url = new URL(req.url || "/", `http://${req.headers.host}`);

          const vReq = {
            method: req.method,
            body,
            query: Object.fromEntries(url.searchParams) as Record<string, string>,
            headers: req.headers as Record<string, string | string[] | undefined>,
            url: req.url,
          };

          const vRes = createVercelRes(res);
          await handler(vReq, vRes);
        } catch (e: any) {
          console.error(`API error [${urlPath}]:`, e);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: e?.message ?? "Internal server error" }));
        }
      });
    },
  };
}
