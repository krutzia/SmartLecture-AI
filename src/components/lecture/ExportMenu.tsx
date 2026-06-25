import { useState } from "react";
import { Download, FileText, FileCode, FileType, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

type Props = { lectureId: string; lectureTitle: string };

type Bundle = {
  title: string;
  quick: string;
  detailed: string;
  bullets: string[];
  takeaways: string[];
  concepts: { term: string; definition: string | null }[];
  flashcards: { question: string; answer: string }[];
};

async function fetchBundle(lectureId: string, title: string): Promise<Bundle> {
  const [sumRes, conRes, fcRes] = await Promise.all([
    supabase.from("summaries").select("quick,detailed,bullets,takeaways").eq("lecture_id", lectureId).maybeSingle(),
    supabase.from("concepts").select("term,definition").eq("lecture_id", lectureId),
    supabase.from("flashcards").select("question,answer").eq("lecture_id", lectureId),
  ]);
  const s = sumRes.data ?? ({} as Record<string, unknown>);
  return {
    title,
    quick: (s as { quick?: string }).quick ?? "",
    detailed: (s as { detailed?: string }).detailed ?? "",
    bullets: ((s as { bullets?: unknown }).bullets as string[] | undefined) ?? [],
    takeaways: ((s as { takeaways?: unknown }).takeaways as string[] | undefined) ?? [],
    concepts: (conRes.data ?? []) as { term: string; definition: string | null }[],
    flashcards: (fcRes.data ?? []) as { question: string; answer: string }[],
  };
}

function bundleToMarkdown(b: Bundle): string {
  const lines: string[] = [];
  lines.push(`# ${b.title}`, "");
  if (b.quick) lines.push(`## Quick Summary`, "", b.quick, "");
  if (b.bullets.length) {
    lines.push(`## Key Points`, "");
    b.bullets.forEach((x) => lines.push(`- ${x}`));
    lines.push("");
  }
  if (b.takeaways.length) {
    lines.push(`## Takeaways`, "");
    b.takeaways.forEach((x) => lines.push(`- ${x}`));
    lines.push("");
  }
  if (b.detailed) lines.push(`## Detailed Notes`, "", b.detailed, "");
  if (b.concepts.length) {
    lines.push(`## Key Concepts`, "");
    b.concepts.forEach((c) => lines.push(`- **${c.term}** — ${c.definition ?? ""}`));
    lines.push("");
  }
  if (b.flashcards.length) {
    lines.push(`## Flashcards`, "");
    b.flashcards.forEach((f, i) => lines.push(`${i + 1}. **Q:** ${f.question}`, `   **A:** ${f.answer}`, ""));
  }
  return lines.join("\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportMarkdown(b: Bundle) {
  download(new Blob([bundleToMarkdown(b)], { type: "text/markdown" }), `${b.title}.md`);
}

function exportPdf(b: Bundle) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const writeHeading = (t: string, size = 18) => {
    ensure(size + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(t, margin, y);
    y += size + 8;
  };
  const writeText = (t: string, size = 11) => {
    if (!t) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(t, width);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += 4;
  };

  writeHeading(b.title, 22);
  if (b.quick) { writeHeading("Quick Summary"); writeText(b.quick); }
  if (b.bullets.length) {
    writeHeading("Key Points");
    b.bullets.forEach((x) => writeText(`• ${x}`));
  }
  if (b.takeaways.length) {
    writeHeading("Takeaways");
    b.takeaways.forEach((x) => writeText(`• ${x}`));
  }
  if (b.detailed) { writeHeading("Detailed Notes"); writeText(b.detailed); }
  if (b.concepts.length) {
    writeHeading("Key Concepts");
    b.concepts.forEach((c) => writeText(`• ${c.term} — ${c.definition ?? ""}`));
  }
  if (b.flashcards.length) {
    writeHeading("Flashcards");
    b.flashcards.forEach((f, i) => {
      writeText(`${i + 1}. Q: ${f.question}`);
      writeText(`   A: ${f.answer}`);
    });
  }
  doc.save(`${b.title}.pdf`);
}

async function exportDocx(b: Bundle) {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.title)] }));

  const section = (title: string) =>
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }));
  const para = (t: string) =>
    children.push(new Paragraph({ children: [new TextRun(t)] }));

  if (b.quick) { section("Quick Summary"); para(b.quick); }
  if (b.bullets.length) {
    section("Key Points");
    b.bullets.forEach((x) => children.push(new Paragraph({ text: x, bullet: { level: 0 } })));
  }
  if (b.takeaways.length) {
    section("Takeaways");
    b.takeaways.forEach((x) => children.push(new Paragraph({ text: x, bullet: { level: 0 } })));
  }
  if (b.detailed) { section("Detailed Notes"); b.detailed.split(/\n\n+/).forEach(para); }
  if (b.concepts.length) {
    section("Key Concepts");
    b.concepts.forEach((c) =>
      children.push(
        new Paragraph({
          children: [new TextRun({ text: c.term, bold: true }), new TextRun(` — ${c.definition ?? ""}`)],
        })
      )
    );
  }
  if (b.flashcards.length) {
    section("Flashcards");
    b.flashcards.forEach((f, i) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. Q: `, bold: true }), new TextRun(f.question)] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `   A: `, bold: true }), new TextRun(f.answer)] }));
    });
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  download(blob, `${b.title}.docx`);
}

export const ExportMenu = ({ lectureId, lectureTitle }: Props) => {
  const [busy, setBusy] = useState(false);

  const run = async (kind: "pdf" | "docx" | "md") => {
    try {
      setBusy(true);
      const b = await fetchBundle(lectureId, lectureTitle);
      if (kind === "md") exportMarkdown(b);
      else if (kind === "pdf") exportPdf(b);
      else await exportDocx(b);
      toast.success(`Exported as ${kind.toUpperCase()}`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => run("pdf")}>
          <FileType className="mr-2 h-4 w-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("docx")}>
          <FileText className="mr-2 h-4 w-4" /> DOCX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("md")}>
          <FileCode className="mr-2 h-4 w-4" /> Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
