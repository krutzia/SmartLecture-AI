import { supabase } from "./localStore";

const DB_PREFIX = "sl_db_";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readStoredFile(path: string): string | null {
  try {
    const dataUrl = localStorage.getItem(DB_PREFIX + "storage_" + path);
    if (!dataUrl) return null;
    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;
    const mime = parts[0].match(/:(.*?);/)?.[1] ?? "";
    if (mime === "text/plain" || mime === "text/csv" || mime.startsWith("text/")) {
      return decodeURIComponent(escape(atob(parts[1])));
    }
    return null;
  } catch {
    return null;
  }
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n{2,}/g, "\n")
    .replace(/\n/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 500);
}

function extractTerms(text: string): Array<{ term: string; definition: string; kind: string }> {
  const sentences = splitSentences(text);
  const terms: Array<{ term: string; definition: string; kind: string }> = [];
  const seen = new Set<string>();

  for (const s of sentences) {
    const m = s.match(/^([A-Z][A-Za-z0-9\s-]{2,40})\s+is\s+(?:a|an|the)\s+(.+)/);
    if (m && !seen.has(m[1].toLowerCase().trim())) {
      seen.add(m[1].toLowerCase().trim());
      terms.push({ term: m[1].trim(), definition: s, kind: "definition" });
    }
  }

  for (const s of sentences) {
    const m = s.match(/^([A-Z][A-Za-z0-9\s-]{2,40})\s+(?:refers to|means|involves|describes|denotes)\s+/i);
    if (m && !seen.has(m[1].toLowerCase().trim())) {
      seen.add(m[1].toLowerCase().trim());
      terms.push({ term: m[1].trim(), definition: s, kind: "definition" });
    }
  }

  for (const s of sentences) {
    const phrases = s.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g);
    if (phrases) {
      for (const p of phrases) {
        if (!seen.has(p.toLowerCase()) && p.length > 5 && p.length < 50) {
          seen.add(p.toLowerCase());
          terms.push({ term: p, definition: s, kind: "concept" });
        }
      }
    }
  }

  if (terms.length === 0) {
    const words = text.split(/\s+/);
    const freq: Record<string, number> = {};
    const stopWords = new Set("the a an of and or to in on for is are was were with that this it as by from at be this that these those which what how when where who".split(" "));
    for (const w of words) {
      const clean = w.toLowerCase().replace(/[^a-z]/g, "");
      if (clean.length > 4 && !stopWords.has(clean)) {
        freq[clean] = (freq[clean] || 0) + 1;
      }
    }
    const top = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    for (const [word, count] of top) {
      if (seen.has(word)) continue;
      seen.add(word);
      const cap = word.charAt(0).toUpperCase() + word.slice(1);
      const matching = sentences.find((s) => s.toLowerCase().includes(word)) ?? `${cap} is a key concept discussed in this lecture (${count} mentions).`;
      terms.push({ term: cap, definition: matching, kind: "keyword" });
    }
  }

  return terms.slice(0, 20);
}

function generateFlashcards(
  text: string,
): Array<{ question: string; answer: string }> {
  const sentences = splitSentences(text);
  const cards: Array<{ question: string; answer: string }> = [];
  const seenQ = new Set<string>();

  for (const s of sentences) {
    if (cards.length >= 12) break;
    const defMatch = s.match(/^(.+?)\s+is\s+(?:a|an|the)\s+(.+)/i);
    if (defMatch && defMatch[1].trim().length > 3 && defMatch[1].trim().length < 60) {
      const q = `What is ${defMatch[1].trim()}?`;
      if (!seenQ.has(q.toLowerCase())) {
        seenQ.add(q.toLowerCase());
        cards.push({ question: q, answer: s });
        continue;
      }
    }

    const causeMatch = s.match(/^(.+?)\s+(?:causes?|leads to|results in|enables?|prevents?|allows?)\s+(.+)/i);
    if (causeMatch) {
      const q = `What is the effect of ${causeMatch[1].trim()}?`;
      if (!seenQ.has(q.toLowerCase())) {
        seenQ.add(q.toLowerCase());
        cards.push({ question: q, answer: s });
        continue;
      }
    }

    if ((s.includes(":") || s.includes(";")) && s.length < 200) {
      const parts = s.split(/[:;]/);
      if (parts.length >= 2 && parts[0].trim().length > 5) {
        const q = `Explain: ${parts[0].trim()}`;
        if (!seenQ.has(q.toLowerCase())) {
          seenQ.add(q.toLowerCase());
          cards.push({ question: q, answer: parts.slice(1).join(":").trim() });
          continue;
        }
      }
    }
  }

  return cards;
}

function generateSummary(
  text: string,
  title: string,
): {
  quick: string;
  detailed: string;
  bullets: string[];
  takeaways: string[];
} {
  const sentences = splitSentences(text);

  if (sentences.length === 0) {
    return {
      quick: `This lecture covers "${title}". The material includes key concepts, definitions, and applications relevant to the subject.`,
      detailed: `## ${title}\n\nThis lecture provides an overview of the topic, covering fundamental concepts and their practical applications.\n\nThe material is structured to build understanding from core principles to more advanced topics, with examples and explanations throughout.`,
      bullets: [
        `Topic: ${title}`,
        "Key definitions and terminology",
        "Core principles and concepts",
        "Practical applications and examples",
      ],
      takeaways: [
        `Understand the fundamental concepts of ${title}`,
        "Define and apply key terminology",
        "Connect theory to practical scenarios",
      ],
    };
  }

  const quick = sentences.slice(0, 2).join(" ");
  const detailedParts: string[] = [`## ${title}\n`];
  for (let i = 0; i < sentences.length; i += 3) {
    detailedParts.push(sentences.slice(i, i + 3).join(" "));
  }
  const detailed = detailedParts.join("\n\n");
  const bullets = sentences
    .filter((s) => s.length > 30 && s.length < 200)
    .slice(0, 8)
    .map((s) => s.replace(/\.$/, ""));
  const takeaways = sentences.filter((s) => s.length > 20).slice(0, 5).map((s) => s.replace(/\.$/, "").trim());

  return { quick, detailed, bullets, takeaways };
}

function generateQuizQuestions(
  text: string,
  title: string,
  numQuestions: number,
): Array<Record<string, any>> {
  const sentences = splitSentences(text);
  const questions: Array<Record<string, any>> = [];

  for (const s of sentences) {
    if (questions.length >= numQuestions) break;
    const m = s.match(/^(.+?)\s+is\s+(?:a|an|the)\s+(.+)/i);
    if (m && m[1].trim().length > 3 && m[1].trim().length < 60) {
      const wrongOpts = [
        `A process related to ${m[1].trim().toLowerCase()}`,
        "A type of error handling mechanism",
        "An unrelated concept from a different field",
      ];
      questions.push({
        type: "mcq",
        question: `What is ${m[1].trim()}?`,
        topic: title,
        options: [s, ...wrongOpts],
        correct_index: 0,
        explanation: s,
      });
    }
  }

  for (const s of sentences) {
    if (questions.length >= numQuestions) break;
    if (s.length > 20 && s.length < 150 && !s.includes("?") && !questions.some((q) => q.question === s)) {
      questions.push({
        type: "tf",
        question: s,
        topic: title,
        answer: true,
        explanation: `This statement is accurate as described in the lecture.`,
      });
    }
  }

  for (const s of sentences) {
    if (questions.length >= numQuestions) break;
    const fillMatch = s.match(/(.+?)\s+is\s+(?:a|an|the)\s+(.+)/i);
    if (fillMatch && fillMatch[1].trim().length > 3 && fillMatch[1].trim().length < 40) {
      const already = questions.some((q) => q.type === "fib" && q.answer?.toLowerCase() === fillMatch[1].trim().toLowerCase());
      if (!already) {
        questions.push({
          type: "fib",
          question: `Fill in the blank: _____ is ${fillMatch[2].trim().replace(/\.$/, "")}`,
          topic: title,
          answer: fillMatch[1].trim(),
          explanation: s,
        });
      }
    }
  }

  if (questions.length === 0) {
    questions.push(
      {
        type: "tf",
        question: `This lecture covers concepts related to "${title}".`,
        topic: title,
        answer: true,
        explanation: "The lecture discusses key topics related to this subject.",
      },
      {
        type: "mcq",
        question: `What is the main topic of this lecture?`,
        topic: title,
        options: [title, "Unrelated topic A", "Unrelated topic B", "Unrelated topic C"],
        correct_index: 0,
        explanation: `The lecture is titled "${title}".`,
      },
    );
  }

  return questions.slice(0, numQuestions);
}

function generateConceptsFromText(
  text: string,
  title: string,
): Array<{ term: string; definition: string; kind: string; cluster: string }> {
  const terms = extractTerms(text);

  if (terms.length === 0) {
    return [
      { term: title, definition: `The central topic of this lecture. ${title} covers key principles, definitions, and applications discussed throughout the material.`, kind: "concept", cluster: "Core Concepts" },
      { term: "Key Definitions", definition: "Fundamental terms and their precise meanings as introduced in the lecture.", kind: "definition", cluster: "Core Concepts" },
      { term: "Applications", definition: "Practical scenarios where the concepts from this lecture are used.", kind: "keyword", cluster: "Applications" },
      { term: "Core Principles", definition: "The foundational rules and guidelines that govern the subject matter.", kind: "concept", cluster: "Core Concepts" },
    ];
  }

  return terms.map((t, i) => ({
    ...t,
    cluster: `Topic ${Math.floor(i / 3) + 1}`,
  }));
}

async function updateStatus(lectureId: string, status: string) {
  await supabase.from("lectures").update({ status }).eq("id", lectureId);
}

export async function processLectureLocally(lectureId: string, userId: string): Promise<void> {
  const { data: lecture } = await supabase
    .from("lectures")
    .select("*")
    .eq("id", lectureId)
    .maybeSingle();

  if (!lecture) throw new Error("Lecture not found");

  await updateStatus(lectureId, "extracting");
  await delay(600);

  let transcriptText: string;
  const filePath: string = lecture.file_path ?? "";

  if (filePath.startsWith("weblink::")) {
    const url = filePath.replace("weblink::", "");
    transcriptText = `Lecture imported from: ${url}\n\nThis lecture was imported from a web link. The content covers the main topics presented in the source material.\n\nKey topics discussed include the fundamental principles, core concepts, and practical applications of the subject matter. The lecture follows a structured approach to explain the material, building from basic definitions to more complex ideas.`;
  } else {
    const fileContent = readStoredFile(filePath);
    if (fileContent && fileContent.trim().length > 50) {
      transcriptText = fileContent;
    } else {
      const title = lecture.title ?? "Untitled Lecture";
      transcriptText = `Transcript for: ${title}\n\nThis lecture covers the topic of ${title}. The material includes detailed explanations of core concepts, definitions of key terms, and examples illustrating practical applications.\n\nThe lecture begins with an introduction to the fundamental principles, followed by a discussion of the main concepts and their relationships. Key terms are defined and explained in context, with examples provided to reinforce understanding.\n\nThe second part of the lecture explores advanced topics and applications, building on the foundational knowledge established earlier. Real-world examples and case studies are discussed to demonstrate how these concepts apply in practice.\n\nThe lecture concludes with a summary of the key points and a discussion of how the concepts relate to each other and to the broader field of study.`;
    }
  }

  await supabase.from("transcripts").insert({
    lecture_id: lectureId,
    user_id: userId,
    full_text: transcriptText,
  });

  await updateStatus(lectureId, "transcribing");
  await delay(300);

  let apiSummary: any = null;
  let apiConcepts: any[] = [];
  let apiFlashcards: any[] = [];
  let apiQuestions: any[] = [];

  try {
    const resp = await fetch("/api/process-lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lectureId,
        userId,
        transcript: transcriptText,
        title: lecture.title ?? "Untitled Lecture",
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.summary) apiSummary = data.summary;
      if (Array.isArray(data.concepts) && data.concepts.length > 0) apiConcepts = data.concepts;
      if (Array.isArray(data.flashcards) && data.flashcards.length > 0) apiFlashcards = data.flashcards;
      if (data.quiz && Array.isArray(data.quiz.questions) && data.quiz.questions.length > 0) {
        apiQuestions = data.quiz.questions;
      }
    }
  } catch (e) {
    console.warn("API process-lecture failed, falling back to local processing:", e);
  }

  await updateStatus(lectureId, "summarizing");
  await delay(300);

  const summary = apiSummary ?? generateSummary(transcriptText, lecture.title ?? "Untitled Lecture");
  await supabase.from("summaries").insert({
    lecture_id: lectureId,
    user_id: userId,
    quick: summary.quick,
    detailed: summary.detailed,
    bullets: summary.bullets,
    takeaways: summary.takeaways,
  });

  const concepts = apiConcepts.length > 0
    ? apiConcepts
    : generateConceptsFromText(transcriptText, lecture.title ?? "Untitled Lecture");
  for (const c of concepts) {
    await supabase.from("concepts").insert({
      lecture_id: lectureId,
      user_id: userId,
      term: c.term,
      definition: c.definition,
      kind: c.kind ?? "concept",
      cluster: c.cluster ?? "General",
    });
  }

  const flashcards = apiFlashcards.length > 0
    ? apiFlashcards
    : generateFlashcards(transcriptText);
  const now = new Date().toISOString();
  for (const fc of flashcards) {
    await supabase.from("flashcards").insert({
      lecture_id: lectureId,
      user_id: userId,
      question: fc.question,
      answer: fc.answer,
      known: false,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      due_date: now,
      last_reviewed_at: null,
    });
  }

  const quizQuestions = apiQuestions.length > 0
    ? apiQuestions
    : generateQuizQuestions(transcriptText, lecture.title ?? "Untitled Lecture", 8);
  await supabase.from("quizzes").insert({
    lecture_id: lectureId,
    user_id: userId,
    title: `Quiz · ${new Date().toLocaleDateString()}`,
    questions: quizQuestions,
    question_count: quizQuestions.length,
  });

  await updateStatus(lectureId, "done");
}

export async function generateQuizLocally(
  lectureId: string,
  userId: string,
  numQuestions: number,
  focusTopic?: string,
): Promise<{ quizId: string; questions: Array<Record<string, any>> }> {
  const { data: transcript } = await supabase
    .from("transcripts")
    .select("full_text")
    .eq("lecture_id", lectureId)
    .maybeSingle();

  const { data: lecture } = await supabase
    .from("lectures")
    .select("title")
    .eq("id", lectureId)
    .maybeSingle();

  const text = transcript?.full_text ?? "";
  const title = focusTopic ?? lecture?.title ?? "Quiz";

  const questions = generateQuizQuestions(text, title, numQuestions);
  const quizId = crypto.randomUUID();

  await supabase.from("quizzes").insert({
    id: quizId,
    lecture_id: lectureId,
    user_id: userId,
    title: focusTopic ? `Focused: ${focusTopic}` : `Quiz \u00b7 ${new Date().toLocaleDateString()}`,
    questions,
    question_count: questions.length,
  });

  return { quizId, questions };
}

export async function clusterConceptsLocally(lectureId: string): Promise<void> {
  const { data: concepts } = await supabase
    .from("concepts")
    .select("id,term,definition,kind")
    .eq("lecture_id", lectureId)
    .order("created_at");

  if (!concepts || concepts.length === 0) return;

  const clusters: Record<string, string[]> = {};
  for (const c of concepts) {
    const def = (c.definition ?? "").toLowerCase();
    let assigned = false;
    for (const [name, ids] of Object.entries(clusters)) {
      const representative = ids[0];
      const rep = concepts.find((x) => x.id === representative);
      if (rep) {
        const repDef = (rep.definition ?? "").toLowerCase();
        const repTerm = rep.term.toLowerCase();
        if (def.includes(repTerm) || repDef.includes((c.term ?? "").toLowerCase())) {
          ids.push(c.id);
          assigned = true;
          break;
        }
      }
    }
    if (!assigned) {
      clusters[c.id] = [c.id];
    }
  }

  const clusterNames: Record<string, string> = {};
  const namePool = ["Fundamentals", "Mechanisms", "Applications", "Theory", "Practice", "Advanced Topics", "Key Terms", "Examples"];
  let nameIdx = 0;
  for (const [repId, ids] of Object.entries(clusters)) {
    const rep = concepts.find((x) => x.id === repId);
    const name = rep?.term ?? namePool[nameIdx % namePool.length];
    clusterNames[repId] = name;
    nameIdx++;
    for (const id of ids) {
      await supabase.from("concepts").update({ cluster: name }).eq("id", id);
    }
  }
}
