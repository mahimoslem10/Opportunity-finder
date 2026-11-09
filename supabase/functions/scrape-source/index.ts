const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScrapedItem {
  title: string;
  link: string;
  description: string;
}

interface ScrapeResponse {
  items: ScrapedItem[];
  sourceType: "rss" | "html";
  error?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRssItems(xml: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];

  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
  if (itemMatches) {
    for (const block of itemMatches) {
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const descMatch = block.match(
        /<description[^>]*>([\s\S]*?)<\/description>/i
      );
      const title = decodeXmlEntities(stripHtml(titleMatch?.[1] || "")).trim();
      const link = decodeXmlEntities((linkMatch?.[1] || "").trim());
      const description = stripHtml(
        decodeXmlEntities(descMatch?.[1] || "")
      ).slice(0, 500);
      if (title) {
        items.push({ title, link, description });
      }
    }
  }

  const entryMatches = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi);
  if (entryMatches) {
    for (const block of entryMatches) {
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
      const altLinkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const summaryMatch = block.match(
        /<summary[^>]*>([\s\S]*?)<\/summary>/i
      );
      const contentMatch = block.match(
        /<content[^>]*>([\s\S]*?)<\/content>/i
      );
      const title = decodeXmlEntities(stripHtml(titleMatch?.[1] || "")).trim();
      const link = decodeXmlEntities(
        (linkMatch?.[1] || altLinkMatch?.[1] || "").trim()
      );
      const description = stripHtml(
        decodeXmlEntities(summaryMatch?.[1] || contentMatch?.[1] || "")
      ).slice(0, 500);
      if (title) {
        items.push({ title, link, description });
      }
    }
  }

  return items;
}

function extractHtmlItems(html: string, baseUrl: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];

  const articleMatches = html.match(/<article[\s>][\s\S]*?<\/article>/gi);
  if (articleMatches) {
    for (const block of articleMatches.slice(0, 30)) {
      const headingMatch = block.match(
        /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i
      );
      const linkMatch = block.match(/<a[^>]*href="([^"]+)"/i);
      const title = stripHtml(headingMatch?.[1] || "").trim();
      const rawLink = (linkMatch?.[1] || "").trim();
      const link = rawLink
        ? new URL(rawLink, baseUrl).href
        : "";
      const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const description = stripHtml(pMatch?.[1] || "").slice(0, 500);
      if (title) {
        items.push({ title, link, description });
      }
    }
  }

  if (items.length === 0) {
    const linkRegex =
      /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let count = 0;
    while ((match = linkRegex.exec(html)) !== null && count < 30) {
      const rawLink = match[1].trim();
      const text = stripHtml(match[2]).trim();
      if (
        text.length > 15 &&
        text.length < 300 &&
        rawLink &&
        !rawLink.startsWith("#") &&
        !rawLink.startsWith("javascript:")
      ) {
      try {
        const link = new URL(rawLink, baseUrl).href;
        items.push({ title: text, link, description: "" });
        count++;
      } catch {
        // skip invalid URLs
      }
      }
    }
  }

  if (items.length === 0) {
    const cardMatches = html.match(
      /<(?:div|li)[^>]*(?:class|id)="[^"]*(?:card|post|item|entry|article)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi
    );
    if (cardMatches) {
      for (const block of cardMatches.slice(0, 30)) {
        const headingMatch = block.match(
          /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i
        );
        const linkMatch = block.match(/<a[^>]*href="([^"]+)"/i);
        const title = stripHtml(headingMatch?.[1] || "").trim();
        const rawLink = (linkMatch?.[1] || "").trim();
        const link = rawLink
          ? (() => {
            try {
              return new URL(rawLink, baseUrl).href;
            } catch {
              return "";
            }
          })()
          : "";
        if (title) {
          const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
          const description = stripHtml(pMatch?.[1] || "").slice(0, 500);
          items.push({ title, link, description });
        }
      }
    }
  }

  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url, sourceType } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL is required" } as ScrapeResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; OpportunityFinderBot/1.0; +https://opportunityfinder.app)",
          Accept: "text/html, application/rss+xml, application/xml, text/xml, */*",
        },
        redirect: "follow",
      });
    } catch {
      return new Response(
        JSON.stringify({
          items: [],
          sourceType: sourceType || "html",
          error: `Could not reach ${url}. The site may be down or blocking automated requests.`,
        } as ScrapeResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          items: [],
          sourceType: sourceType || "html",
          error: `Site returned HTTP ${res.status}`,
        } as ScrapeResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    const isRss =
      contentType.includes("rss") ||
      contentType.includes("xml") ||
      text.includes("<rss") ||
      text.includes("<feed") ||
      text.includes("<channel");

    let items: ScrapedItem[];
    let detectedType: "rss" | "html";

    if (isRss || sourceType === "rss") {
      items = extractRssItems(text);
      detectedType = "rss";
    } else {
      items = extractHtmlItems(text, url);
      detectedType = "html";
    }

    if (items.length === 0 && !isRss && sourceType !== "rss") {
      const rssCheck = extractRssItems(text);
      if (rssCheck.length > 0) {
        items = rssCheck;
        detectedType = "rss";
      }
    }

    return new Response(
      JSON.stringify({
        items: items.slice(0, 50),
        sourceType: detectedType,
      } as ScrapeResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        items: [],
        sourceType: "html",
        error: err instanceof Error ? err.message : "Unknown error",
      } as ScrapeResponse),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
