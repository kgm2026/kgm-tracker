import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MIMO_API_KEY = Deno.env.get("MIMO_API_KEY");
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { messages, projectData } = await req.json();

    if (!MIMO_API_KEY) {
      return new Response(JSON.stringify({ error: "MiMo API key not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(projectData);

    // Check if any message contains images
    const hasImages = messages.some((m: any) => {
      if (Array.isArray(m.content)) {
        return m.content.some((c: any) => c.type === "image_url");
      }
      return false;
    });

    // Use Omni for multimodal, Pro for text-only
    const model = hasImages ? "mimo-v2-omni" : "mimo-v2-pro";

    const response = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: hasImages ? 2048 : 1024,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "MiMo request failed" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

function buildSystemPrompt(projectData: any): string {
  const { projectName, materials, payments, contractors, budgets, totalBudget } = projectData || {};

  const matTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.total) || 0), 0);
  const paidTotal = (payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const unpaidTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.unpaid) || 0), 0);

  return `You are an AI assistant for KGM Constructions, a construction project management tracker in Pakistan.
You help the user understand their project data. Answer questions about spending, budgets, materials, contractors, and payments.
You can also analyze site photos, drawings, blueprints, and construction progress images.

CURRENT PROJECT: ${projectName || "Unknown"}
BUDGET: PKR ${(totalBudget || 0).toLocaleString("en-PK")}

MATERIAL PURCHASES SUMMARY:
- Total entries: ${(materials || []).length}
- Total material spend: PKR ${matTotal.toLocaleString("en-PK")}
- Total unpaid: PKR ${unpaidTotal.toLocaleString("en-PK")}
${(materials || []).slice(0, 20).map((m: any) => `  #${m.num} | ${m.date} | ${m.material} | ${m.supplier} | Qty: ${m.qty} ${m.unit} @ ${m.rate} | Total: ${m.total} | ${m.status}`).join("\n")}

PAYMENTS SUMMARY:
- Total paid: PKR ${paidTotal.toLocaleString("en-PK")}
- Entry count: ${(payments || []).length}
${(payments || []).slice(0, 15).map((p: any) => `  #${p.num} | ${p.date} | ${p.contractor_name} | ${p.amount} | ${p.method}`).join("\n")}

CONTRACTORS:
${(contractors || []).map((c: any) => `  ${c.name} | ${c.trade} | Contract: ${c.contract_value} | Paid: ${c.amount_paid} | Due: ${c.amount_due} | ${c.work_status}`).join("\n")}

BUDGET BREAKDOWN:
${(budgets || []).map((b: any) => `  ${b.cat}: Budget ${b.budget} / Actual ${b.actual}`).join("\n")}

Rules:
- Always use PKR (Pakistani Rupees) for currency
- Keep answers concise and actionable
- If asked about trends, compare numbers from the data
- If data is insufficient to answer, say so clearly
- If given images: analyze site progress, identify work phases, assess quality, note issues
- If given drawings/blueprints: identify type, dimensions, rooms, materials, and estimate costs
- Use construction industry terminology appropriate for Pakistan`;
}
