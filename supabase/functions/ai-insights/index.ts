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
    const { projectData } = await req.json();

    if (!MIMO_API_KEY) {
      return new Response(JSON.stringify({ error: "MiMo API key not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const analysisPrompt = buildAnalysisPrompt(projectData);

    const response = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mimo-v2-pro",
        messages: [
          {
            role: "system",
            content: `You are a construction project financial analyst for KGM Constructions.
Analyze the project data and return a JSON object with insights. Always use PKR for currency.
Be specific with numbers. Return ONLY valid JSON, no markdown fences.`,
          },
          { role: "user", content: analysisPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "MiMo request failed" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let insights;
    try {
      insights = JSON.parse(data.choices[0].message.content);
    } catch {
      insights = { summary: data.choices[0].message.content, alerts: [], recommendations: [] };
    }

    return new Response(JSON.stringify(insights), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

function buildAnalysisPrompt(projectData: any): string {
  const { projectName, materials, payments, contractors, budgets, totalBudget, progressEntries } = projectData || {};

  const matTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.total) || 0), 0);
  const contractorPayments = (payments || []).filter((p: any) => !p.payment_type || p.payment_type === "contractor");
  const supplierPayments = (payments || []).filter((p: any) => p.payment_type === "supplier");
  const totalContractorPayments = contractorPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const totalSupplierPayments = supplierPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const totalSpent = matTotal + totalContractorPayments + totalSupplierPayments;
  const remaining = (totalBudget || 0) - totalSpent;
  const unpaidTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.unpaid) || 0), 0);

  // Group materials by type for trend detection
  const materialGroups: Record<string, any[]> = {};
  (materials || []).forEach((m: any) => {
    const key = (m.material || "other").toLowerCase();
    if (!materialGroups[key]) materialGroups[key] = [];
    materialGroups[key].push(m);
  });

  // Detect price changes per material type
  const priceTrends = Object.entries(materialGroups).map(([name, items]) => {
    if (items.length < 2) return null;
    const sorted = [...items].sort((a: any, b: any) => (a.num || 0) - (b.num || 0));
    const firstRate = Number(sorted[0].rate) || 0;
    const lastRate = Number(sorted[sorted.length - 1].rate) || 0;
    const change = firstRate > 0 ? ((lastRate - firstRate) / firstRate * 100).toFixed(1) : "N/A";
    return { material: name, firstRate, lastRate, changePct: change, count: items.length };
  }).filter(Boolean);

  // Build progress entries summary
  const progressSummary = (progressEntries || []).map((p: any) => {
    const analysis = p.ai_analysis ? (() => { try { return JSON.parse(p.ai_analysis); } catch { return null; } })() : null;
    let line = `  ${p.created_at?.substring(0, 10) || '?'} | ${p.title} | Phase: ${p.phase || 'general'}`;
    if (analysis) {
      if (analysis.quality) line += ` | Quality: ${analysis.quality}`;
      if (analysis.progressPct != null) line += ` | Progress: ${analysis.progressPct}%`;
      if (analysis.summary) line += ` | ${analysis.summary.substring(0, 100)}`;
      if (analysis.issues?.length) line += ` | Issues: ${analysis.issues.join('; ')}`;
    }
    return line;
  }).join("\n");

  return `Analyze this construction project and return insights as JSON:

PROJECT: ${projectName}
TOTAL BUDGET: PKR ${(totalBudget || 0).toLocaleString("en-PK")}
TOTAL SPENT: PKR ${totalSpent.toLocaleString("en-PK")}
REMAINING: PKR ${remaining.toLocaleString("en-PK")}
TOTAL UNPAID: PKR ${unpaidTotal.toLocaleString("en-PK")}

MATERIALS (${(materials || []).length} entries, PKR ${matTotal.toLocaleString("en-PK")} total):
${(materials || []).map((m: any) => `  ${m.material} | ${m.supplier} | ${m.qty} ${m.unit} @ ${m.rate} | Total: ${m.total} | ${m.status} | ${m.date}`).join("\n")}

PRICE TRENDS BY MATERIAL:
${priceTrends.map((t: any) => `  ${t.material}: ${t.firstRate} → ${t.lastRate} (${t.changePct}% change, ${t.count} purchases)`).join("\n")}

PAYMENTS (${(payments || []).length} entries, PKR ${(totalContractorPayments + totalSupplierPayments).toLocaleString("en-PK")} total):
${(payments || []).map((p: any) => `  ${p.date} | ${p.contractor_name} | ${p.amount} | ${p.method}`).join("\n")}

CONTRACTORS (${(contractors || []).length}):
${(contractors || []).map((c: any) => `  ${c.name} | ${c.trade} | Contract: ${c.contract_value} | Paid: ${c.amount_paid} | Due: ${c.amount_due} | ${c.work_status}`).join("\n")}

BUDGET BREAKDOWN:
${(budgets || []).map((b: any) => `  ${b.cat}: Budget ${b.budget}`).join("\n")}

SITE PROGRESS ENTRIES (from photos/videos analyzed by AI):
${progressSummary || "  No progress entries yet"}

Use the site progress data to identify if actual work aligns with spending, if quality issues correlate with costs, and if the project phase matches budget utilization.

Return JSON with this structure:
{
  "summary": "2-3 sentence overall project health summary",
  "budgetHealth": "good|warning|critical",
  "budgetUtilizationPct": number,
  "alerts": [
    { "severity": "high|medium|low", "title": "short title", "detail": "specific detail with PKR amounts" }
  ],
  "priceTrends": [
    { "material": "name", "trend": "rising|stable|falling", "changePct": number, "detail": "explanation" }
  ],
  "recommendations": [
    "specific actionable recommendation"
  ],
  "unpaidHighlight": "summary of unpaid amounts and risk"
}`;
}
