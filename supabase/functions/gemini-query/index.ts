// gemini-query: server-side Gemini proxy with privacy enforcement.
// Reads GEMINI_API_KEY from server secrets — never exposed to the browser.
// Restricts Gemini to public, non-personal information by default.
// Personal data is blocked unless a valid single-use approval token is provided.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOKENS = 200;
const TIMEOUT_MS = 15_000;

type Role = "user" | "model";

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: Role;
  parts: GeminiPart[];
}

interface RequestBody {
  task: string;
  prompt: string;
  personalData: boolean;
  payloadHash: string;
  approvalTokenId?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

// Verify the JWT and return the user id. Returns null if invalid.
async function verifyUser(
  authHeader: string | null,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Atomically claim a single-use approval token. Returns true if claimed.
async function claimApprovalToken(
  supabase: ReturnType<typeof createClient>,
  tokenId: string,
  userId: string,
  expectedHash: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_approval_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .eq("payload_hash", expectedHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

async function callGemini(
  apiKey: string,
  prompt: string
): Promise<string> {
  const body = {
    contents: [
      {
        role: "user" as Role,
        parts: [{ text: prompt } as GeminiPart],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: MAX_TOKENS,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini error (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const content: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return content;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json(
        {
          error:
            "Gemini is not configured on the server. Ask the administrator to add the Gemini API key.",
        },
        503
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const userId = await verifyUser(
      req.headers.get("Authorization"),
      supabase
    );
    if (!userId) {
      return json({ error: "You must be signed in to use AI features." }, 401);
    }

    const body: RequestBody = await req.json();
    if (!body.task || typeof body.task !== "string") {
      return json({ error: "Invalid request: task is required." }, 400);
    }
    if (!body.prompt || typeof body.prompt !== "string") {
      return json({ error: "Invalid request: prompt is required." }, 400);
    }
    if (body.prompt.length > 8000) {
      return json({ error: "Request is too large." }, 400);
    }

    // Verify the payload hash matches what the client claims.
    const computedHash = await sha256Hex(body.prompt);
    if (computedHash !== body.payloadHash) {
      return json(
        { error: "Payload verification failed. Please try again." },
        400
      );
    }

    // If personal data is involved, require a valid single-use approval token.
    if (body.personalData) {
      if (!body.approvalTokenId) {
        return json(
          {
            error:
              "This request includes personal information. Explicit approval is required before it can be sent to Gemini.",
          },
          403
        );
      }

      const claimed = await claimApprovalToken(
        supabase,
        body.approvalTokenId,
        userId,
        computedHash
      );
      if (!claimed) {
        return json(
          {
            error:
              "Approval is missing, expired, or already used. Please review and approve again.",
          },
          403
        );
      }
    }

    const content = await callGemini(apiKey, body.prompt);

    if (!content) {
      return json({ error: "Gemini returned an empty response." }, 502);
    }

    return json({
      content,
      model: GEMINI_MODEL,
      provider: "gemini",
    });
  } catch (err) {
    // Generic error to the client — no key or stack trace leaked.
    return json(
      { error: "The AI request could not be completed. Please try again." },
      500
    );
  }
});
