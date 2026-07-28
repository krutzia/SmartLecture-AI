import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env into process.env so API handlers can read it
function loadEnv() {
  try {
    const candidatePaths = [
      path.resolve(__dirname, ".env"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(__dirname, "..", ".env"),
    ];
    for (const envPath of candidatePaths) {
      if (fs.existsSync(envPath)) {
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
          process.env[key] = val;
        }
        break;
      }
    }
  } catch {
    // .env not found — handlers will throw if GEMINI_API_KEY is missing
  }
}
loadEnv();

const HANDLER_MAP: Record<string, string> = {
  "/chat-with-lecture": "./api/chat-with-lecture.ts",
  "/process-lecture": "./api/process-lecture.ts",
  "/generate-quiz": "./api/generate-quiz.ts",
  "/cluster-concepts": "./api/cluster-concepts.ts",
  "/health": "./api/health.ts",
};

async function loadHandler(route: string, server: ViteDevServer): Promise<((req: any, res: any) => Promise<void>) | null> {
  const rel = HANDLER_MAP[route];
  if (!rel) return null;

  const filePath = path.resolve(__dirname, rel);
  const mod = await server.ssrLoadModule(filePath);
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
  let isHeadersSent = false;
  const headers: Record<string, string> = {};
  const vRes: any = {
    _statusCode: 200,
    get headersSent() {
      return res.headersSent || isHeadersSent;
    },
    status(code: number) {
      vRes._statusCode = code;
      return vRes;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return vRes;
    },
    json(data: any) {
      const finalHeaders = { "content-type": "application/json", ...headers };
      if (!res.headersSent && !isHeadersSent) {
        res.writeHead(vRes._statusCode, finalHeaders);
        isHeadersSent = true;
      }
      res.end(JSON.stringify(data));
    },
    write(chunk: any) {
      if (!res.headersSent && !isHeadersSent) {
        res.writeHead(vRes._statusCode, headers);
        isHeadersSent = true;
      }
      return res.write(chunk);
    },
    end(data?: any) {
      if (!res.headersSent && !isHeadersSent) {
        res.writeHead(vRes._statusCode, headers);
        isHeadersSent = true;
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

        try {
          const handler = await loadHandler(urlPath, server);
          if (!handler) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Unknown route: ${urlPath}` }));
            return;
          }

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
