import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ArticlePayload {
  title: string;
  description: string;
  url: string;
  source: string;
  author: string | null;
  category: string;
  sentiment: string;
  urgency_score: number;
  region_id: string;
  region_name: string;
  country: string | null;
  language: string;
  image_url: string | null;
  provider: string;
  published_at: string;
  canonical_url: string;
  content_hash: string;
  quality_score: number;
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return rawUrl ? rawUrl.split("?")[0].replace(/\/$/, "") : "";
  }
}

// 1. Fetch from GDELT DOC API
async function fetchGDELTNews(): Promise<ArticlePayload[]> {
  try {
    const res = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=india%20OR%20technology%20OR%20business%20OR%20politics&mode=artlist&maxrecords=30&format=json");
    if (!res.ok) return [];
    const data = await res.json();
    const articles = data.articles || [];
    const results: ArticlePayload[] = [];

    for (const art of articles) {
      if (!art.title || !art.url) continue;
      const title = art.title.trim();
      const canonical = canonicalizeUrl(art.url);
      const hash = await hashText(`${title}|${art.domain || "gdelt"}`);

      results.push({
        title,
        description: title,
        url: art.url,
        source: art.domain || "GDELT Network",
        author: null,
        category: "World",
        sentiment: "Neutral",
        urgency_score: 50,
        region_id: "global",
        region_name: "Global",
        country: art.sourcecountry || null,
        language: art.language || "English",
        image_url: art.socialimage || null,
        provider: "GDELT",
        published_at: (() => {
          if (art.seendate) {
            const m = art.seendate.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
            if (m) {
              const [, y, mo, d, h, mi, s] = m;
              return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
            }
          }
          return new Date().toISOString();
        })(),
        canonical_url: canonical,
        content_hash: hash,
        quality_score: 90,
      });
    }
    return results;
  } catch {
    return [];
  }
}

// 2. Fetch from The Guardian Open API
async function fetchGuardianNews(): Promise<ArticlePayload[]> {
  try {
    const res = await fetch("https://content.guardianapis.com/search?q=world&page-size=20&show-fields=trailText,thumbnail,byline&api-key=test");
    if (!res.ok) return [];
    const data = await res.json();
    const results: ArticlePayload[] = [];

    for (const art of data.response?.results || []) {
      if (!art.webTitle || !art.webUrl) continue;
      const title = art.webTitle.trim();
      const canonical = canonicalizeUrl(art.webUrl);
      const hash = await hashText(`${title}|the guardian`);

      results.push({
        title,
        description: art.fields?.trailText ? art.fields.trailText.replace(/<[^>]*>/g, "") : title,
        url: art.webUrl,
        source: "The Guardian",
        author: art.fields?.byline || null,
        category: "World",
        sentiment: "Neutral",
        urgency_score: 45,
        region_id: "global",
        region_name: "Global",
        country: "UK",
        language: "en",
        image_url: art.fields?.thumbnail || null,
        provider: "The Guardian",
        published_at: art.webPublicationDate || new Date().toISOString(),
        canonical_url: canonical,
        content_hash: hash,
        quality_score: 95,
      });
    }
    return results;
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = performance.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const [gdeltArticles, guardianArticles] = await Promise.all([
      fetchGDELTNews(),
      fetchGuardianNews(),
    ]);

    const allArticles = [...gdeltArticles, ...guardianArticles];

    if (allArticles.length === 0) {
      return new Response(
        JSON.stringify({ fetched: 0, inserted: 0, message: "No articles fetched from providers" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("news_articles")
      .upsert(allArticles, { onConflict: "content_hash", ignoreDuplicates: true })
      .select("id");

    const durationMs = Math.round(performance.now() - startTime);
    const insertedCount = data?.length || 0;

    // Log pipeline job run
    await supabase.from("pipeline_jobs").insert({
      provider: "Multi-Provider (GDELT + Guardian)",
      fetched_count: allArticles.length,
      inserted_count: insertedCount,
      skipped_count: allArticles.length - insertedCount,
      rejected_count: 0,
      duration_ms: durationMs,
      status: error ? "FAILED" : "SUCCESS",
      error_message: error ? error.message : null,
    });

    return new Response(
      JSON.stringify({
        fetched: allArticles.length,
        inserted: insertedCount,
        skipped: allArticles.length - insertedCount,
        durationMs,
        providers: ["GDELT", "The Guardian"],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
