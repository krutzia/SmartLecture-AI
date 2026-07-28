import { describe, it, expect, vi } from "vitest";
import { splitIntoSlides, buildChatPrompt, cleanAndParseJson } from "../../api/lib/gemini.ts";
import healthHandler from "../../api/health.ts";
import chatHandler from "../../api/chat-with-lecture.ts";

// Mock @google/generative-ai
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContent: async () => ({
            response: {
              text: () => "OK",
            },
          }),
          startChat: () => ({
            sendMessageStream: async () => ({
              stream: (async function* () {
                yield { text: () => "Hello! " };
                yield { text: () => "This is a response." };
              })(),
            }),
          }),
        };
      }
    },
  };
});

describe("Gemini API Utilities", () => {
  it("splitIntoSlides splits text into paragraphs or blocks", () => {
    const text = "Slide 1 text content here.\n\nSlide 2 text content here.\n\nSlide 3 text content here.";
    const slides = splitIntoSlides(text);
    expect(slides).toHaveLength(3);
    expect(slides[0]).toContain("Slide 1");
    expect(slides[1]).toContain("Slide 2");
    expect(slides[2]).toContain("Slide 3");
  });

  it("buildChatPrompt constructs system prompt with transcript", () => {
    const prompt = buildChatPrompt("Lecture transcript content", []);
    expect(prompt).toContain("Lecture transcript content");
    expect(prompt).toContain("[[slide:N]]");
  });

  it("cleanAndParseJson parses json with markdown code fences", () => {
    const raw = "```json\n{\"key\": \"value\"}\n```";
    const result = cleanAndParseJson<{ key: string }>(raw);
    expect(result.key).toBe("value");
  });

  it("cleanAndParseJson parses json without markdown fences", () => {
    const raw = "{\"quick\": \"summary text\"}";
    const result = cleanAndParseJson<{ quick: string }>(raw);
    expect(result.quick).toBe("summary text");
  });
});

describe("API Handlers", () => {
  function createMockRes() {
    let statusCode = 200;
    const headers: Record<string, string> = {};
    let data = "";
    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
        return res;
      },
      json(obj: any) {
        data = JSON.stringify(obj);
      },
      write(chunk: string) {
        data += chunk;
      },
      end(d?: string) {
        if (d) data += d;
      },
      getStatus: () => statusCode,
      getData: () => data,
      getHeaders: () => headers,
    };
    return res;
  }

  it("healthHandler returns ok status", async () => {
    process.env.GEMINI_API_KEY = "AIzaSyTestApiKeyForTesting12345";
    const req: any = { method: "GET", body: {} };
    const res = createMockRes();

    await healthHandler(req, res);
    expect(res.getStatus()).toBe(200);
    expect(res.getData()).toContain('"ok":true');
  });

  it("chatHandler returns slides mode correctly", async () => {
    const req: any = {
      method: "POST",
      body: {
        lectureId: "lec-123",
        userId: "user-456",
        mode: "slides",
        transcript: "Paragraph 1\n\nParagraph 2",
      },
    };
    const res = createMockRes();

    await chatHandler(req, res);
    expect(res.getStatus()).toBe(200);
    const parsed = JSON.parse(res.getData());
    expect(parsed.slides).toEqual(["Paragraph 1", "Paragraph 2"]);
  });

  it("chatHandler streams SSE response for chat messages", async () => {
    process.env.GEMINI_API_KEY = "AIzaSyTestApiKeyForTesting12345";
    const req: any = {
      method: "POST",
      body: {
        lectureId: "lec-123",
        userId: "user-456",
        messages: [{ role: "user", content: "Explain quantum mechanics" }],
        transcript: "Quantum mechanics is...",
      },
    };
    const res = createMockRes();

    await chatHandler(req, res);
    expect(res.getData()).toContain("data: {\"choices\":[{\"delta\":{\"content\":\"Hello! \"}}]}");
    expect(res.getData()).toContain("data: [DONE]");
  });
});
