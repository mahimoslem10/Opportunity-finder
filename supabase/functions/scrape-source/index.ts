import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 50;
const HOURLY_LIMIT = 20;
const SAME_SOURCE_COOLDOWN_MS = 5 * 60 * 1000;
const ALLOWED_CONTENT = /text\/html|application\/xhtml\+xml|application\/xml|text\/xml|application\/rss\+xml|application\/atom\+xml/i;

interface ParsedItem {
  title: string;
  link: string;
  description: string;
  deadline: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateSourceUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  if (url.hostname.toLowerCase() === "localhost" || !url.hostname.includes(".")) return null;
  return url;
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7));
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff")
  );
}

// Fails closed: if the host cannot be resolved to public addresses, the fetch is refused.
async function assertPublicHost(hostname: string): Promise<void> {
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
    Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
  ]);
  const addresses = [...v4, ...v6];
  if (addresses.length === 0) throw new Error("host did not resolve");
  for (const ip of v4) if (isPrivateIPv4(ip)) throw new Error("private address");
  for (const ip of v6) if (isPrivateIPv6(ip)) throw new Error("private address");
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchSource(start: URL): Promise<{ body: string; contentType: string; finalUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (hop > 0) {
        const allowed = validateSourceUrl(current.href);
        if (!allowed) throw new Error("redirect to an invalid address");
        current = allowed;
      }
      await assertPublicHost(current.hostname);
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "OpportunityFinderBot/1.0 (+https://opportunityfinder.app)",
          Accept: "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml;q=0.9",
        },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) throw new Error("redirect without location");
        current = new URL(location, current);
        continue;
      }
      if (!res.ok) throw new Error(`site returned HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      if (!ALLOWED_CONTENT.test(contentType)) throw new Error("unsupported content type");
      const body = await readLimited(res);
      return { body, contentType, finalUrl: current };
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractDeadline(text: string): string {
  const match = text.match(
    /(?:deadline|closing date|apply by|applications? (?:close|due))[^0-9A-Za-z]{0,20}(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i
  );
  return match ? match[1] : "";
}

function toItem(title: string, link: string, description: string): ParsedItem | null {
  if (!title) return null;
  let safeLink = "";
  if (link) {
    try {
      const u = new URL(link);
      if (u.protocol === "https:") safeLink = u.href;
    } catch {
      safeLink = "";
    }
  }
  const desc = description.slice(0, 500);
  return { title: title.slice(0, 300), link: safeLink, description: desc, deadline: extractDeadline(description) };
}

function parseFeed(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []),
  ];
  for (const block of blocks) {
    const field = (name: string) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
      return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
    };
    const hrefLink = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const title = stripTags(field("title"));
    const link = (field("link") || hrefLink).trim();
    const description = stripTags(field("description") || field("summary") || field("content"));
    const item = toItem(title, link, description);
    if (item) items.push(item);
  }
  return items;
}

function parseHtml(html: string, baseUrl: URL): ParsedItem[] {
  const items: ParsedItem[] = [];
  const articles = html.match(/<article[\s>][\s\S]*?<\/article>/gi) ?? [];
  for (const block of articles.slice(0, MAX_ITEMS)) {
    const title = stripTags(block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] ?? "");
    const rawHref = block.match(/<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const link = resolveLink(rawHref, baseUrl);
    const description = stripTags(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const item = toItem(title, link, description);
    if (item) items.push(item);
  }
  if (items.length > 0) return items;

  const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(html)) !== null && items.length < MAX_ITEMS) {
    const text = stripTags(m[2]);
    if (text.length < 15 || text.length > 200) continue;
    const link = resolveLink(m[1], baseUrl);
    if (!link) continue;
    const item = toItem(text, link, "");
    if (item) items.push(item);
  }
  return items;
}

function resolveLink(raw: string, base: URL): string {
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return "";
  try {
    const u = new URL(raw, base);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function dedupeKey(item: { link: string; title: string }): string {
  return item.link || `title:${item.title.toLowerCase()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Please sign in again to fetch sources." }, 401);
    }

    const body = await req.json().catch(() => null);
    const target = validateSourceUrl(body?.url);
    if (!target) {
      return json({ error: "Please enter a secure web address starting with https://." }, 403);
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from("source_fetch_log")
      .select("source_url, fetched_at")
      .gte("fetched_at", since)
      .order("fetched_at", { ascending: false })
      .limit(HOURLY_LIMIT + 1);
    if (recentError) throw recentError;
    if ((recent ?? []).length >= HOURLY_LIMIT) {
      return json({ error: "You have reached the fetch limit for this hour. Please try again later." }, 429);
    }
    const lastSame = (recent ?? []).find((r) => r.source_url === target.href);
    if (lastSame && Date.now() - Date.parse(lastSame.fetched_at) < SAME_SOURCE_COOLDOWN_MS) {
      return json({ error: "This source was fetched a few minutes ago. Please wait before fetching it again." }, 429);
    }

    const { error: logError } = await supabase.from("source_fetch_log").insert({ source_url: target.href });
    if (logError) throw logError;

    const { data: sources, error: sourcesError } = await supabase
      .from("sources")
      .select("id, name, url")
      .order("created_at", { ascending: true });
    if (sourcesError) throw sourcesError;
    let source = (sources ?? []).find((s) => {
      try {
        return new URL(s.url).hostname.toLowerCase() === target.hostname.toLowerCase();
      } catch {
        return false;
      }
    });
    if (!source) {
      const { data: created, error: createError } = await supabase
        .from("sources")
        .insert({ name: target.hostname, url: target.origin, type: "webpage", added_on: new Date().toISOString().slice(0, 10) })
        .select("id, name, url")
        .single();
      if (createError) throw createError;
      source = created;
    }

    let fetched: { body: string; contentType: string; finalUrl: URL };
    try {
      fetched = await fetchSource(target);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.error("source fetch failed", target.hostname, reason);
      const message = "The source could not be fetched. The site may be unavailable or blocking automated requests.";
      await supabase
        .from("sources")
        .update({ last_checked_at: new Date().toISOString(), last_fetch_status: "error", last_fetch_error: message })
        .eq("id", source.id);
      return json({ error: message, items: [], parsedCount: 0, newCount: 0, duplicateCount: 0 }, 502);
    }

    const isFeed = /xml|rss|atom/i.test(fetched.contentType) || /<(rss|feed)[\s>]/i.test(fetched.body.slice(0, 500));
    const parsed = (isFeed ? parseFeed(fetched.body) : parseHtml(fetched.body, fetched.finalUrl)).slice(0, MAX_ITEMS);

    const links = parsed.map((p) => p.link).filter(Boolean);
    const existingKeys = new Set<string>();
    if (links.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from("discovered")
        .select("link")
        .in("link", links);
      if (existingError) throw existingError;
      for (const row of existing ?? []) existingKeys.add(dedupeKey({ link: row.link, title: "" }));
    }

    const today = new Date().toISOString().slice(0, 10);
    const withStatus = parsed.map((item) => {
      const key = dedupeKey(item);
      const isDuplicate = existingKeys.has(key);
      existingKeys.add(key);
      return { ...item, isDuplicate };
    });
    const toInsert = withStatus.filter((i) => !i.isDuplicate);

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("discovered").insert(
        toInsert.map((item) => ({
          title: item.title,
          organization: "",
          link: item.link,
          notes: item.deadline ? `${item.description}\nDeadline: ${item.deadline}`.trim() : item.description,
          source_id: source.id,
          discovered_on: today,
        }))
      );
      if (insertError) throw insertError;
    }

    await supabase
      .from("sources")
      .update({ last_checked_at: new Date().toISOString(), last_fetch_status: "ok", last_fetch_error: "" })
      .eq("id", source.id);

    return json({
      items: withStatus,
      sourceType: isFeed ? "rss" : "html",
      parsedCount: parsed.length,
      newCount: toInsert.length,
      duplicateCount: withStatus.length - toInsert.length,
    });
  } catch (err) {
    console.error("scrape-source error", err instanceof Error ? err.message : err);
    return json({ error: "Source fetching failed unexpectedly. Please try again." }, 500);
  }
});
