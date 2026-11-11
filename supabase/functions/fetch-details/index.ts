// fetch-details: fetches content from a single URL only. No cross-site fallback.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FetchDetailsResponse {
  title: string;
  content: string;
  sections: { heading: string; body: string }[];
  error?: string;
  source?: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function extractMainContent(html: string): {
  title: string;
  sections: { heading: string; body: string }[];
  fullText: string;
} {
  const sections: { heading: string; body: string }[] = [];

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const contentPatterns = [
    /<main[\s>][\s\S]*?<\/main>/i,
    /<article[\s>][\s\S]*?<\/article>/i,
    /<div[^>]*(?:class|id)="[^"]*(?:post-content|entry-content|article-body|main-content|post-body|content-area|single-content|detail-content|page-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*(?:class|id)="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  let contentHtml = "";
  for (const pattern of contentPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[0].length > 500) {
      contentHtml = match[0];
      break;
    }
  }

  if (!contentHtml) {
    const bodyMatch = cleaned.match(/<body[\s>][\s\S]*?<\/body>/i);
    contentHtml = bodyMatch ? bodyMatch[0] : cleaned;
  }

  const h1Match = contentHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = cleanText(stripHtml(h1Match?.[1] || ""));

  const headingRegex = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch;
  const headingPositions: { text: string; start: number; end: number }[] = [];

  while ((headingMatch = headingRegex.exec(contentHtml)) !== null) {
    const text = cleanText(stripHtml(headingMatch[2]));
    if (text && text.length < 200) {
      headingPositions.push({
        text,
        start: headingMatch.index + headingMatch[0].length,
        end: 0,
      });
    }
  }

  for (let i = 0; i < headingPositions.length; i++) {
    headingPositions[i].end =
      i + 1 < headingPositions.length
        ? headingPositions[i + 1].start - headingPositions[i + 1].text.length - 20
        : contentHtml.length;
  }

  for (const hp of headingPositions) {
    const sectionHtml = contentHtml.slice(
      hp.start,
      hp.end > hp.start ? hp.end : contentHtml.length
    );
    const pMatches = sectionHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let body: string;
    if (pMatches && pMatches.length > 0) {
      body = pMatches
        .map((p) => cleanText(stripHtml(p)))
        .filter((p) => p.length > 10)
        .join("\n\n");
    } else {
      body = cleanText(stripHtml(sectionHtml));
    }
    if (body && body.length > 15) {
      sections.push({ heading: hp.text, body: body.slice(0, 3000) });
    }
  }

  if (sections.length === 0) {
    const pMatches = contentHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) {
      const allParas = pMatches
        .map((p) => cleanText(stripHtml(p)))
        .filter((p) => p.length > 20)
        .join("\n\n");
      if (allParas) {
        sections.push({ heading: "Details", body: allParas.slice(0, 8000) });
      }
    }
  }

  if (sections.length === 0) {
    const liMatches = contentHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (liMatches && liMatches.length > 2) {
      const allItems = liMatches
        .map((li) => cleanText(stripHtml(li)))
        .filter((li) => li.length > 10)
        .join("\n");
      if (allItems.length > 50) {
        sections.push({ heading: "Details", body: allItems.slice(0, 8000) });
      }
    }
  }

  const fullText = cleanText(stripHtml(contentHtml)).slice(0, 15000);
  return { title, sections, fullText };
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html, application/xhtml+xml, application/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

function isBlockedPage(html: string): boolean {
  const lower = html.toLowerCase();
  if (lower.includes("cloudflare") && (lower.includes("challenge") || lower.includes("turnstile"))) return true;
  if (lower.includes("captcha") || lower.includes("access denied")) return true;
  if (lower.includes("are you a robot") || lower.includes("verify you are human")) return true;
  if (lower.includes("request blocked") || lower.includes("blocked by")) return true;
  return false;
}

async function tryFetch(
  url: string,
  timeoutMs = 8000
): Promise<{
  title: string;
  sections: { heading: string; body: string }[];
  fullText: string;
} | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
  clearTimeout(timeoutId);

  if (!res.ok) return null;

  const html = await res.text();
  if (html.length < 200) return null;
  if (isBlockedPage(html)) return null;

  const result = extractMainContent(html);
  if (result.sections.length === 0 && result.fullText.length < 100) return null;

  return result;
}

// Public fetching is disabled: this endpoint has no authentication or URL restrictions.
const DETAILS_FETCH_ENABLED = false;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!DETAILS_FETCH_ENABLED) {
    return new Response(
      JSON.stringify({
        title: "",
        content: "",
        sections: [],
        error: "Detail fetching is temporarily unavailable.",
      } as FetchDetailsResponse),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({
          title: "",
          content: "",
          sections: [],
          error: "URL is required",
        } as FetchDetailsResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await tryFetch(url);

    if (result) {
      return new Response(
        JSON.stringify({
          title: result.title,
          content: result.fullText,
          sections: result.sections,
          source: "primary",
        } as FetchDetailsResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        title: "",
        content: "",
        sections: [],
        error: "Could not fetch the page from the original URL. The site may be blocking automated requests or the page may be unavailable. Try the \"Open original\" link to view it directly in your browser.",
      } as FetchDetailsResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        title: "",
        content: "",
        sections: [],
        error: err instanceof Error ? err.message : "Unknown error",
      } as FetchDetailsResponse),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
