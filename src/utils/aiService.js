import { AUTH_REQUIRED_MESSAGE } from './api';
import { supabase } from './supabaseClient';

const MAX_RETRIES = 3;
const MAX_CHAT_MESSAGES = 10;

async function callEdgeFunction(name, body, { retries = MAX_RETRIES, onRetry } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error(AUTH_REQUIRED_MESSAGE);

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(name, {
        body,
      });
      if (error) {
        throw new Error(await getFunctionErrorMessage(error));
      }
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        onRetry?.(attempt + 1, retries, delay);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function getFunctionErrorMessage(error) {
  if (error?.context) {
    try {
      const payload = await error.context.clone().json();
      if (payload?.error) return payload.error;
    } catch (parseErr) {
      // Non-JSON error body; we'll try plain text next.
      void parseErr;
    }

    try {
      const text = await error.context.clone().text();
      if (text) return text;
    } catch (textErr) {
      // Ignore unreadable response body and fallback to generic message.
      void textErr;
    }
  }

  return error?.message || 'AI request failed';
}

export async function sendChatMessage(messages, projectData, { onRetry } = {}) {
  // Sliding window: keep last N messages to prevent payload bloat
  const trimmed = messages.length > MAX_CHAT_MESSAGES
    ? messages.slice(-MAX_CHAT_MESSAGES)
    : messages;
  return callEdgeFunction('ai-chat', { messages: trimmed, projectData }, { onRetry });
}

export async function getInsights(projectData, { onRetry } = {}) {
  return callEdgeFunction('ai-insights', { projectData }, { onRetry });
}

export async function getForecast(projectData, { onRetry } = {}) {
  return callEdgeFunction('ai-forecast', { projectData }, { onRetry });
}

export async function analyzeProgress({ projectId, title, description, images }, { onRetry } = {}) {
  return callEdgeFunction('ai-progress', {
    action: 'analyze',
    projectId,
    title,
    description,
    images,
  }, { onRetry });
}

export async function scanInvoice({ imageBase64, imageType }, { onRetry } = {}) {
  return callEdgeFunction('ai-chat', {
    messages: [
      {
        role: 'system',
        content: `You are an invoice/receipt OCR assistant for a construction project in Pakistan. Extract structured data from the image. Return ONLY valid JSON with this exact schema:
{
  "items": [
    {
      "material": "string - material/item name",
      "supplier": "string - vendor/supplier name if visible",
      "qty": number or null,
      "unit": "string - bags, cft, kg, etc or empty",
      "rate": number or null - per unit price,
      "total": number - total amount for this line,
      "date": "YYYY-MM-DD or empty"
    }
  ],
  "supplier": "string - overall supplier/vendor name",
  "date": "YYYY-MM-DD - invoice date",
  "invoiceNumber": "string or null",
  "grandTotal": number or null
}
If multiple line items exist, return all of them. Currency is PKR. If you can't read a field, set it to null or empty string. Do NOT include any explanation, only the JSON.`
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageType};base64,${imageBase64}` } },
          { type: 'text', text: 'Extract all items from this invoice/receipt.' }
        ]
      }
    ],
    projectData: {}
  }, { onRetry });
}

export async function analyzeDrawing({ imageBase64, imageType, description }, { onRetry } = {}) {
  return callEdgeFunction('ai-progress', {
    action: 'drawings',
    imageBase64,
    imageType,
    description,
  }, { onRetry });
}
