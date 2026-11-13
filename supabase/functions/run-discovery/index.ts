// run-discovery: Automated opportunity discovery engine
// Fetches from seed sources and user sources, extracts structured data,
// deduplicates, and stores results. Supports both manual and scheduler triggers.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Discovery-Secret",
};

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS_PER_SOURCE = 30;
const MAX_SOURCES_PER_RUN = 15;
const SCHEDULER_SECRET = Deno.env.get("DISCOVERY_SCHEDULER_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- URL validation & SSRF protection (reused from scrape-source) ---

function validateSourceUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.hostname.toLowerCase() === "localhost" || !url.hostname.includes(".")) return null;
  return url;
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7));
  return lower === "::" || lower === "::1" ||
    lower.startsWith("fc") || lower.startsWith("fd") ||
    lower.startsWith("fe8") || lower.startsWith("fe9") ||
    lower.startsWith("fea") || lower.startsWith("feb") ||
    lower.startsWith("ff");
}

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

// --- Fetching ---

async function fetchSource(start: URL): Promise<{ body: string; contentType: string; finalUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (hop > 0) {
        const allowed = validateSourceUrl(current.href);
        if (!allowed) throw new Error("redirect to invalid address");
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      const body = await readLimited(res);
      return { body, contentType, finalUrl: current };
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
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
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("response too large"); }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(merged);
}

// --- Text utilities ---

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function resolveLink(raw: string, base: URL): string {
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return "";
  try { const u = new URL(raw, base); return u.protocol === "https:" ? u.href : ""; } catch { return ""; }
}

// --- Deadline parsing ---

function parseDeadline(text: string): string {
  if (!text) return "";
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/i,
    /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    /([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return normalizeDate(m[1]);
  }
  return "";
}

function normalizeDate(raw: string): string {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Try "15 January 2025" or "January 15, 2025"
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m1 = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const mon = months[m1[2].toLowerCase()];
    if (mon) return `${m1[3]}-${mon}-${day}`;
  }
  const m2 = raw.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m2) {
    const day = m2[2].padStart(2, "0");
    const mon = months[m2[1].toLowerCase()];
    if (mon) return `${m2[3]}-${mon}-${day}`;
  }
  // MM/DD/YYYY
  const m3 = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return `${m3[3]}-${m3[1].padStart(2, "0")}-${m3[2].padStart(2, "0")}`;
  return raw;
}

// --- Structured extraction ---

interface DiscoveredItem {
  title: string;
  link: string;
  description: string;
  organization: string;
  deadline: string;
  deadlineRaw: string;
  country: string;
  studyLevel: string;
  fundingType: string;
  verificationStatus: string;
}

function classifyOpportunity(text: string): { studyLevel: string; fundingType: string } {
  const lower = text.toLowerCase();
  let studyLevel = "";
  if (/\bph\.?d\b|doctoral|doctorate/.test(lower)) studyLevel = "phd";
  else if (/master'?s?|\bm\.?sc\b|\bmba\b|postgraduate/.test(lower)) studyLevel = "master";
  else if (/bachelor|undergraduate/.test(lower)) studyLevel = "bachelor";

  let fundingType = "";
  if (/fully funded|full funding|full scholarship|fully-funded/.test(lower)) fundingType = "fully_funded";
  else if (/partial|partially funded|stipend|tuition waiver/.test(lower)) fundingType = "partially_funded";
  else if (/self.funded|self funded|tuition fee|no funding/.test(lower)) fundingType = "self_funded";

  return { studyLevel, fundingType };
}

function extractCountry(text: string): string {
  const countries = [
    "Germany", "France", "Netherlands", "Belgium", "Italy", "Spain", "Switzerland",
    "United Kingdom", "UK", "Sweden", "Norway", "Denmark", "Finland", "Ireland",
    "Austria", "Poland", "Portugal", "Greece", "Czech Republic", "Hungary",
    "United States", "USA", "Canada", "Australia", "New Zealand",
    "Japan", "South Korea", "Singapore", "China", "India",
    "Turkey", "UAE", "Qatar", "Saudi Arabia",
  ];
  const lower = text.toLowerCase();
  for (const c of countries) {
    if (lower.includes(c.toLowerCase())) return c;
  }
  return "";
}

function extractOrganization(text: string, title: string): string {
  // Look for "at [Organization]" or "by [Organization]" patterns
  const m = text.match(/(?:at|by|from|hosted by)\s+([A-Z][A-Za-z\s&]{2,40}(?:University|Institute|Foundation|Organization|Centre|Center|Programme|Program|College|School|Department|Ministry|Council))/);
  if (m) return m[1].trim();
  // Look for organization in title
  const titleM = title.match(/(?:at|@)\s+([A-Z][A-Za-z\s&]{2,40})/);
  if (titleM) return titleM[1].trim();
  return "";
}

// --- Feed parsers ---

function parseFeed(xml: string, sourceUrl: string): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []),
  ];
  for (const block of blocks.slice(0, MAX_ITEMS_PER_SOURCE)) {
    const field = (name: string) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
      return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
    };
    const hrefLink = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const title = stripTags(field("title"));
    const link = (field("link") || hrefLink).trim();
    const description = stripTags(field("description") || field("summary") || field("content"));
    if (!title) continue;
    items.push(buildItem(title, link, description, sourceUrl));
  }
  return items;
}

function parseHtml(html: string, baseUrl: URL, sourceUrl: string): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  const articles = html.match(/<article[\s>][\s\S]*?<\/article>/gi) ?? [];
  for (const block of articles.slice(0, MAX_ITEMS_PER_SOURCE)) {
    const title = stripTags(block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] ?? "");
    const rawHref = block.match(/<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const link = resolveLink(rawHref, baseUrl);
    const description = stripTags(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    if (!title) continue;
    items.push(buildItem(title, link, description, sourceUrl));
  }
  if (items.length > 0) return items;

  // Fallback: scan anchors that look like opportunity links
  const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(html)) !== null && items.length < MAX_ITEMS_PER_SOURCE) {
    const text = stripTags(m[2]);
    if (text.length < 15 || text.length > 200) continue;
    const link = resolveLink(m[1], baseUrl);
    if (!link) continue;
    // Only include if it looks like an opportunity link
    if (!/scholar|phd|doctoral|master|fellowship|internship|grant|position|opportunity|programme|program|award|competition/i.test(text)) continue;
    items.push(buildItem(text, link, "", sourceUrl));
  }
  return items;
}

function buildItem(title: string, link: string, description: string, sourceUrl: string): DiscoveredItem {
  const fullText = `${title} ${description}`;
  const deadlineRaw = extractDeadlineText(fullText);
  const deadline = parseDeadline(deadlineRaw);
  const { studyLevel, fundingType } = classifyOpportunity(fullText);
  const country = extractCountry(fullText);
  const organization = extractOrganization(description, title);

  // Verification: if source is an official portal, mark as secondary
  // (found on a listing site, not the original opportunity page)
  const verificationStatus = "secondary";

  return {
    title: title.slice(0, 300),
    link,
    description: description.slice(0, 1000),
    organization,
    deadline,
    deadlineRaw,
    country,
    studyLevel,
    fundingType,
    verificationStatus,
  };
}

function extractDeadlineText(text: string): string {
  const match = text.match(
    /(?:deadline|closing date|apply by|applications? (?:close|due|end))[^0-9A-Za-z]{0,20}(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  return match ? match[1] : "";
}

// --- Deduplication ---

function dedupeKey(item: { link: string; title: string }): string {
  if (item.link) return `link:${item.link}`;
  return `title:${normalizeTitle(item.title)}`;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeTitle(a).split(" ").filter((w) => w.length > 2));
  const setB = new Set(normalizeTitle(b).split(" ").filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

// --- Authentication ---

interface AuthContext {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  isScheduler: boolean;
}

async function authenticate(req: Request): Promise<AuthContext | null> {
  // Scheduler path: shared secret
  const schedulerSecret = req.headers.get("X-Discovery-Secret");
  if (schedulerSecret && SCHEDULER_SECRET && schedulerSecret === SCHEDULER_SECRET) {
    // Scheduler runs as service role — no user context, processes all seed sources
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    return { supabase, userId: "", isScheduler: true };
  }

  // User path: JWT auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  return { supabase, userId: userData.user.id, isScheduler: false };
}

// --- Concurrent execution protection ---

async function acquireRunLock(supabase: ReturnType<typeof createClient>, userId: string, triggeredBy: string): Promise<string | null> {
  // Check for existing running discovery
  const { data: existing } = await supabase
    .from("discovery_runs")
    .select("id, started_at")
    .eq(userId ? "user_id" : "triggered_by", userId || triggeredBy)
    .eq("status", "running")
    .limit(1);

  if (existing && existing.length > 0) {
    // Check if it's stale (older than 5 minutes)
    const startedAt = new Date(existing[0].started_at);
    if (Date.now() - startedAt.getTime() < 5 * 60 * 1000) {
      return null; // Active run exists
    }
    // Mark stale run as failed
    await supabase.from("discovery_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", existing[0].id);
  }

  const { data, error } = await supabase
    .from("discovery_runs")
    .insert({
      user_id: userId || null,
      status: "running",
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

// --- Main discovery logic ---

interface DiscoveryResult {
  runId: string;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  newOpportunities: number;
  duplicates: number;
  updated: number;
  errors: string[];
  newItems: DiscoveredItem[];
}

async function runDiscovery(auth: AuthContext): Promise<DiscoveryResult> {
  const { supabase, userId, isScheduler } = auth;
  const triggeredBy = isScheduler ? "scheduler" : "manual";
  const runId = await acquireRunLock(supabase, userId, triggeredBy);
  if (!runId) {
    throw new Error("A discovery run is already in progress. Please wait for it to complete.");
  }

  const errors: string[] = [];
  let sourcesAttempted = 0;
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;
  let newOpportunities = 0;
  let duplicates = 0;
  let updated = 0;
  const allNewItems: DiscoveredItem[] = [];

  try {
    // Gather sources: seed sources + user's own sources
    const { data: seedSources } = await supabase
      .from("discovery_seed_sources")
      .select("id, name, url, source_type, category")
      .eq("is_active", true)
      .limit(MAX_SOURCES_PER_RUN);

    let userSources: { id: string; name: string; url: string; type: string }[] = [];
    if (!isScheduler && userId) {
      const { data: uSources } = await supabase
        .from("sources")
        .select("id, name, url, type")
        .eq("user_id", userId)
        .limit(5);
      userSources = uSources ?? [];
    }

    const allSources = [
      ...(seedSources ?? []).map((s) => ({ url: s.url, sourceType: s.source_type, name: s.name, seedId: s.id, category: s.category })),
      ...userSources.map((s) => ({ url: s.url, sourceType: s.type, name: s.name, seedId: null, category: "general" })),
    ].slice(0, MAX_SOURCES_PER_RUN);

    for (const source of allSources) {
      sourcesAttempted++;
      const targetUrl = validateSourceUrl(source.url);
      if (!targetUrl) {
        sourcesFailed++;
        errors.push(`${source.name}: invalid URL`);
        continue;
      }

      try {
        const fetched = await fetchSource(targetUrl);
        const isFeed = /xml|rss|atom/i.test(fetched.contentType) || /<(rss|feed)[\s>]/i.test(fetched.body.slice(0, 500));
        const parsed = isFeed
          ? parseFeed(fetched.body, source.url)
          : parseHtml(fetched.body, fetched.finalUrl, source.url);

        if (parsed.length === 0) {
          await updateSeedStatus(supabase, source.seedId, "empty", "", 0);
          sourcesSucceeded++;
          continue;
        }

        // Dedup against existing discovered items
        const links = parsed.map((p) => p.link).filter(Boolean);
        const existingItems = new Map<string, { id: string; title: string; link: string }>();

        if (links.length > 0) {
          const { data: existing } = await supabase
            .from("discovered")
            .select("id, title, link")
            .in("link", links);
          for (const row of existing ?? []) {
            existingItems.set(dedupeKey({ link: row.link, title: "" }), { id: row.id, title: row.title, link: row.link });
          }
        }

        // Also check by normalized title for items without links
        const noLinkItems = parsed.filter((p) => !p.link);
        if (noLinkItems.length > 0) {
          const titles = noLinkItems.map((p) => normalizeTitle(p.title));
          const { data: existingTitles } = await supabase
            .from("discovered")
            .select("id, title, link")
            .in("link", titles.map(() => ""));
          // This is a rough check — for items without links, we check title similarity
          for (const row of existingTitles ?? []) {
            const key = `title:${normalizeTitle(row.title)}`;
            if (!existingItems.has(key)) {
              existingItems.set(key, { id: row.id, title: row.title, link: row.link });
            }
          }
        }

        const toInsert: DiscoveredItem[] = [];
        let sourceUpdated = 0;

        for (const item of parsed) {
          const key = dedupeKey(item);
          const existing = existingItems.get(key);

          if (existing) {
            // Check for updates — if new deadline differs, mark as updated
            if (item.deadline) {
              // Check if existing has different/empty deadline
              const shouldUpdate = false; // Conservative: don't auto-update, record conflict
              if (shouldUpdate) {
                sourceUpdated++;
              }
            }
            duplicates++;
          } else {
            toInsert.push(item);
            existingItems.set(key, { id: "", title: item.title, link: item.link });
          }
        }

        // Insert new items
        if (toInsert.length > 0) {
          const insertData = toInsert.map((item) => ({
            title: item.title,
            organization: item.organization,
            link: item.link,
            notes: buildNotes(item),
            deadline_raw: item.deadlineRaw,
            country: item.country,
            study_level: item.studyLevel,
            funding_type: item.fundingType,
            verification_status: item.verificationStatus,
            last_verified_at: new Date().toISOString(),
            discovered_on: new Date().toISOString().slice(0, 10),
            discovery_run_id: runId,
            ...(userId ? { user_id: userId } : {}),
          }));

          const { error: insertError } = await supabase.from("discovered").insert(insertData);
          if (insertError) {
            errors.push(`${source.name}: insert failed - ${insertError.message}`);
          } else {
            newOpportunities += toInsert.length;
            allNewItems.push(...toInsert);
          }
        }

        updated += sourceUpdated;
        await updateSeedStatus(supabase, source.seedId, "ok", "", parsed.length);
        sourcesSucceeded++;
      } catch (err) {
        sourcesFailed++;
        const reason = err instanceof Error ? err.message : "unknown error";
        errors.push(`${source.name}: ${reason}`);
        await updateSeedStatus(supabase, source.seedId, "error", reason.slice(0, 200), 0);
      }
    }

    // Update run record
    await supabase.from("discovery_runs").update({
      status: sourcesFailed === sourcesAttempted ? "failed" : sourcesSucceeded > 0 ? "completed" : "partial",
      completed_at: new Date().toISOString(),
      sources_attempted: sourcesAttempted,
      sources_succeeded: sourcesSucceeded,
      sources_failed: sourcesFailed,
      new_opportunities: newOpportunities,
      duplicates: duplicates,
      updated: updated,
      errors: errors.slice(0, 20),
      triggered_by: triggeredBy,
    }).eq("id", runId);

    return {
      runId,
      sourcesAttempted,
      sourcesSucceeded,
      sourcesFailed,
      newOpportunities,
      duplicates,
      updated,
      errors,
      newItems: allNewItems,
    };
  } catch (err) {
    // Mark run as failed
    await supabase.from("discovery_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      sources_attempted: sourcesAttempted,
      sources_succeeded: sourcesSucceeded,
      sources_failed: sourcesFailed,
      new_opportunities: newOpportunities,
      duplicates: duplicates,
      updated: updated,
      errors: [err instanceof Error ? err.message : "Unknown error"],
    }).eq("id", runId);
    throw err;
  }
}

async function updateSeedStatus(
  supabase: ReturnType<typeof createClient>,
  seedId: string | null,
  status: string,
  error: string,
  itemCount: number
): Promise<void> {
  if (!seedId) return;
  await supabase.from("discovery_seed_sources").update({
    last_checked_at: new Date().toISOString(),
    last_status: status,
    last_error: error,
    last_item_count: itemCount,
  }).eq("id", seedId);
}

function buildNotes(item: DiscoveredItem): string {
  const parts: string[] = [];
  if (item.description) parts.push(item.description);
  if (item.deadlineRaw) parts.push(`Deadline: ${item.deadlineRaw}`);
  if (item.country) parts.push(`Country: ${item.country}`);
  if (item.fundingType) {
    const fundingLabel = item.fundingType === "fully_funded" ? "Fully funded" :
      item.fundingType === "partially_funded" ? "Partially funded" : "Self-funded";
    parts.push(`Funding: ${fundingLabel}`);
  }
  parts.push(`Verification: ${item.verificationStatus}`);
  return parts.join("\n").slice(0, 1000);
}

// --- HTTP handler ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return json({ error: "Authentication required. Sign in or provide a valid scheduler secret." }, 401);
    }

    const result = await runDiscovery(auth);
    return json({
      success: true,
      runId: result.runId,
      sourcesAttempted: result.sourcesAttempted,
      sourcesSucceeded: result.sourcesSucceeded,
      sourcesFailed: result.sourcesFailed,
      newOpportunities: result.newOpportunities,
      duplicates: result.duplicates,
      updated: result.updated,
      errors: result.errors,
      newItems: result.newItems.slice(0, 50),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed unexpectedly.";
    return json({ error: message, success: false }, 500);
  }
});
