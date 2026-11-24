import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const METERED_CREDENTIALS_URL = "https://eow-global.metered.live/api/v1/turn/credentials";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("METERED_TURN_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "TURN service is not configured yet" }), { status: 503, headers: corsHeaders });
  }

  try {
    const url = new URL(METERED_CREDENTIALS_URL);
    url.searchParams.set("apiKey", apiKey);
    const upstream = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      console.error("Metered credentials request failed:", upstream.status);
      return new Response(JSON.stringify({ error: "TURN credentials provider is temporarily unavailable" }), { status: 502, headers: corsHeaders });
    }

    const data = await upstream.json();
    const iceServers = Array.isArray(data) ? data : data?.iceServers;
    if (!Array.isArray(iceServers) || !iceServers.length) {
      console.error("Metered returned an unexpected ICE server payload");
      return new Response(JSON.stringify({ error: "TURN provider returned an invalid response" }), { status: 502, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ iceServers }), {
      status: 200,
      headers: { ...corsHeaders, "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("TURN credential fetch failed:", error);
    return new Response(JSON.stringify({ error: "Unable to retrieve TURN credentials" }), { status: 502, headers: corsHeaders });
  }
});
