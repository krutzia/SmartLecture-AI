import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const lectureId = body?.lectureId;
    const userId = body?.userId;
    if (!lectureId || typeof lectureId !== "string" || !userId) {
      return new Response(JSON.stringify({ error: "lectureId and userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: concepts } = await admin
      .from("concepts")
      .select("id,term,definition")
      .eq("lecture_id", lectureId)
      .eq("user_id", userId);

    if (!concepts || concepts.length < 2) {
      return new Response(JSON.stringify({ clusters: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at organizing knowledge into thematic clusters. Group the provided concepts into 2–6 cohesive clusters. Each cluster needs a short label (1–3 words). Every concept must belong to exactly one cluster.",
          },
          {
            role: "user",
            content: `Cluster these concepts:\n${concepts
              .map((c: any) => `- [${c.id}] ${c.term}: ${c.definition ?? ""}`)
              .join("\n")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_clusters",
              description: "Group concepts into clusters",
              parameters: {
                type: "object",
                properties: {
                  clusters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        concept_ids: { type: "array", items: { type: "string" } },
                      },
                      required: ["label", "concept_ids"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["clusters"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_clusters" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${t}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const args = JSON.parse(toolCall.function.arguments);
    const clusters: { label: string; concept_ids: string[] }[] = args.clusters ?? [];

    // Persist cluster labels on concepts
    const validIds = new Set(concepts.map((c: any) => c.id));
    for (const cluster of clusters) {
      const ids = cluster.concept_ids.filter((id) => validIds.has(id));
      if (ids.length === 0) continue;
      await admin
        .from("concepts")
        .update({ cluster: cluster.label })
        .in("id", ids)
        .eq("user_id", userId);
    }

    return new Response(JSON.stringify({ clusters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cluster-concepts error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
