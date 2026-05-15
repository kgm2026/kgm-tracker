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

    const { action, projectId, title, description, imageBase64, imageType, images } = await req.json();

    if (action === "analyze") {
      return await analyzeProgress({ projectId, title, description, images, imageBase64, imageType, userToken: auth.token });
    }
    if (action === "drawings") {
      return await analyzeDrawing({ imageBase64, imageType, description });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

async function analyzeProgress({ projectId, title, description, images, imageBase64, imageType, userToken }) {
  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI API key not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const imageList = images || (imageBase64 ? [{ base64: imageBase64, type: imageType }] : []);
  const imageCount = imageList.length;

  const messages = [
    {
      role: "system",
      content: `You are a construction site progress analyst for KGM Homes in Pakistan.
Analyze site progress photos/videos and descriptions. Provide:
1. Work phase identification (foundation, grey structure, plumbing, electrical, finishing, etc.)
2. Quality assessment (good, needs attention, concerns)
3. Progress percentage estimate for the visible work
4. Issues or risks spotted
5. Recommended next steps
6. Safety concerns if any visible
${imageCount > 1 ? "These are multiple photos/frames from the same site visit. Analyze ALL of them together for a comprehensive assessment." : ""}
Always use PKR for any cost estimates. Be specific and practical.
Respond in JSON format:
{
  "phase": "detected phase name",
  "progressPct": number (0-100),
  "quality": "good|acceptable|needs-attention|concerns",
  "summary": "2-3 sentence analysis of what you see across all images",
  "observations": ["list of specific observations from the photos"],
  "issues": ["list of issues or risks found"],
  "nextSteps": ["recommended next steps"],
  "safetyNotes": ["safety observations if any"],
  "estimatedCostImpact": "any cost implications in PKR"
}`,
    },
    {
      role: "user",
      content: buildMultiImageMessage({ title, description, images: imageList }),
    },
  ];

  const result = await requestGoogleGemini({
    messages,
    temperature: 0.2,
    max_tokens: 2048,
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let analysis;
  try {
    analysis = JSON.parse(result.data.choices[0].message.content);
  } catch {
    analysis = { summary: result.data.choices[0].message.content };
  }

  if (SURL && SKEY) {
    try {
      await fetch(`${SURL}/rest/v1/progress_entries`, {
        method: "POST",
        headers: {
          apikey: SKEY,
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          project_id: projectId,
          title,
          description,
          image_base64: imageList.length > 0 ? `data:${imageList[0].type};base64,${imageList[0].base64}` : null,
          ai_analysis: JSON.stringify(analysis),
          ai_phase: analysis.phase || "general",
          ai_quality: analysis.quality || null,
          ai_progress_pct: analysis.progressPct ?? null,
          phase: analysis.phase || "general",
          status: "in-progress",
        }),
      });
    } catch (e) {
      console.error("Failed to save progress entry:", e);
    }
  }

  return new Response(JSON.stringify({ analysis }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

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

async function requestGoogleGemini({
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
      model: "gemini-2.5-flash",
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

async function analyzeDrawing({ imageBase64, imageType, description }) {
  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI API key not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const messages = [
    {
      role: "system",
      content: `You are a construction drawing and blueprint analyst for KGM Homes in Pakistan.
Analyze architectural drawings, floor plans, structural drawings, or site plans.

Provide:
1. Drawing type identification (floor plan, elevation, section, structural, electrical, plumbing, site plan)
2. Key dimensions and measurements if visible
3. Room/space identification
4. Material specifications if mentioned
5. Potential issues or conflicts
6. Construction notes and observations
7. Estimated construction cost in PKR based on the drawing

Respond in JSON format:
{
  "drawingType": "type of drawing",
  "dimensions": { "width": "value", "length": "value", "unit": "ft/m" },
  "rooms": ["list of rooms/spaces identified"],
  "materials": ["materials specified or recommended"],
  "measurements": ["key measurements visible"],
  "observations": ["construction observations"],
  "issues": ["potential issues or conflicts"],
  "estimatedCost": "estimated cost in PKR",
  "recommendations": ["recommendations for construction"]
}`,
    },
    {
      role: "user",
      content: buildMultiImageMessage({ title: "Drawing Analysis", description, images: imageBase64 ? [{ base64: imageBase64, type: imageType }] : [] }),
    },
  ];

  const result = await requestGoogleGemini({
    messages,
    temperature: 0.2,
    max_tokens: 2048,
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let analysis;
  try {
    analysis = JSON.parse(result.data.choices[0].message.content);
  } catch {
    analysis = { summary: result.data.choices[0].message.content };
  }

  return new Response(JSON.stringify({ analysis }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildMultiImageMessage({ title, description, images }) {
  const content = [];

  let text = `Title: ${title || "Untitled"}`;
  if (description) text += `\nDescription: ${description}`;
  if (images && images.length > 1) text += `\n\nAnalyze these ${images.length} construction site photos/frames together.`;
  else text += `\n\nAnalyze this construction site photo.`;
  content.push({ type: "text", text });

  if (images && images.length > 0) {
    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.type || "image/jpeg"};base64,${img.base64}` },
      });
    }
  }

  return content;
}
