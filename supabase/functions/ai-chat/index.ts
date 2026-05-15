import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_API_KEY =
  Deno.env.get("GOOGLE_API_KEY") ||
  Deno.env.get("GEMINI_API_KEY");
const MIMO_API_KEY = Deno.env.get("MIMO_API_KEY");
const SURL = Deno.env.get("SUPABASE_URL");
const SKEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_EMAIL = Deno.env.get("ADMIN_EMAIL") || Deno.env.get("ALLOWED_EMAIL");
const supabaseAuth = createClient(
  SURL || "",
  Deno.env.get("SB_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "",
);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const auth = await authorizeRequest(req);
    if (auth.error) return auth.error;

    const { messages, projectData } = await req.json();

    if (!GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(projectData);

    const hasImages = messages.some((m: any) => {
      if (Array.isArray(m.content)) {
        return m.content.some((c: any) => c.type === "image_url");
      }
      return false;
    });

    const result = await requestGoogleGemma({
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3,
      max_tokens: hasImages ? 2048 : 1024,
    });

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: result.data.choices[0].message.content }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

async function authorizeRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: jsonError("Unauthorized", 401) };
  }

  if (!SURL || !SKEY) {
    return { error: jsonError("Supabase auth is not configured", 500) };
  }

  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAuth.auth.getClaims(token);
  const email = data?.claims?.email;

  if (error || !email) {
    return { error: jsonError("Unauthorized", 401) };
  }

  if (!(await isAllowedAppUser(email, token))) {
    return { error: jsonError("Forbidden", 403) };
  }

  return { token, user: data?.claims };
}

async function isAllowedAppUser(email: string, token: string) {
  const envEmails = (ALLOWED_EMAIL || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (envEmails.includes(email.toLowerCase())) return true;

  const response = await fetch(`${SURL}/rest/v1/app_user_roles?select=is_active&email=ilike.${encodeURIComponent(email)}&limit=1`, {
    headers: {
      apikey: SKEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Boolean(rows?.[0]?.is_active);
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function requestGoogleGemma({
  messages,
  temperature,
  max_tokens,
}: {
  messages: any[];
  temperature: number;
  max_tokens: number;
}) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gemma-4-31b-it",
      messages,
      temperature,
      max_tokens,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: extractAiError(data) };
  }

  return { ok: true, data: normalizeCompletionData(data) };
}

function extractAiError(data: any) {
  return data?.error?.message || data?.error || "AI request failed";
}

function normalizeCompletionData(data: any) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    data.choices[0].message.content = stripThoughtTags(content);
  }
  return data;
}

function stripThoughtTags(content: string) {
  const stripped = content.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
  return stripped || content.trim();
}

function buildSystemPrompt(projectData: any): string {
  const { projectName, materials, payments, contractors, budgets, totalBudget } = projectData || {};

  const matTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.total) || 0), 0);
  const paidTotal = (payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const unpaidTotal = (materials || []).reduce((s: number, m: any) => s + (Number(m.unpaid) || 0), 0);

  return `You are an AI assistant for KGM Homes, a construction project management tracker in Pakistan.
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
