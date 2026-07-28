import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const MODEL = "gemini-2.0-flash";

export function getGemini(opts?: { systemInstruction?: string; jsonMode?: boolean }): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment variables");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: opts?.systemInstruction,
    generationConfig: opts?.jsonMode ? { responseMimeType: "application/json" } : undefined,
  });
}

export function cleanAndParseJson<T = any>(text: string): T {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch {}
    }
    throw new Error(`Failed to parse JSON from response: ${text.slice(0, 100)}`);
  }
}

export function splitIntoSlides(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length <= 1) {
    const lines = text.split(/\n/).filter((l) => l.trim());
    const chunkSize = Math.max(1, Math.ceil(lines.length / 6));
    const slides: string[] = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      slides.push(lines.slice(i, i + chunkSize).join("\n"));
    }
    return slides.length ? slides : [text];
  }
  return blocks;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function buildChatPrompt(transcript: string, messages: ChatMessage[]): string {
  return `You are a helpful study tutor. The student has the following lecture transcript. Answer their questions clearly, concisely, and accurately based ONLY on the lecture content.

When referring to specific slides or sections, use the marker [[slide:N]] where N is the 1-based slide number.

LECTURE TRANSCRIPT:
${transcript.slice(0, 30000)}

Be helpful, encouraging, and educational.`;
}

export type VercelRequest = {
  method?: string;
  body: any;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
};

export type VercelResponse = {
  status(code: number): VercelResponse;
  json(data: any): void;
  setHeader(name: string, value: string): VercelResponse;
  write(chunk: any): boolean;
  end(data?: any): void;
  writeHead(code: number, headers?: Record<string, string>): VercelResponse;
  headersSent?: boolean;
};

export function jsonError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

export function readBody(req: VercelRequest): Promise<any> {
  if (req.body !== undefined && req.body !== null) return Promise.resolve(req.body);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const nodeReq = req as any;
    if (nodeReq.on) {
      nodeReq.on("data", (c: Buffer) => chunks.push(c));
      nodeReq.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          resolve({});
        }
      });
    } else {
      resolve({});
    }
  });
}
