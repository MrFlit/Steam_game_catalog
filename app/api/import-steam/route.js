import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const bucket = "game-images";

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin.startsWith("chrome-extension://") ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function clientForToken(accessToken) {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function getBearer(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isSteamUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "store.steampowered.com";
  } catch {
    return false;
  }
}

function isSteamImageUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (
      u.hostname === "steamcdn-a.akamaihd.net" ||
      u.hostname.endsWith(".steamstatic.com") ||
      u.hostname.endsWith(".akamaihd.net")
    );
  } catch {
    return false;
  }
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  if (!supabaseUrl || !publishableKey) {
    return json(request, { error: "Server Supabase configuration is missing." }, 500);
  }

  const token = getBearer(request);
  if (!token) return json(request, { error: "Authorization token is required." }, 401);

  const url = new URL(request.url);
  const appId = (url.searchParams.get("appId") || "").trim();

  if (!/^\d+$/.test(appId)) {
    return json(request, { error: "Invalid Steam App ID." }, 400);
  }

  const supabase = clientForToken(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return json(request, { error: "Invalid or expired session." }, 401);
  }

  const { data, error } = await supabase
    .from("games")
    .select("id, title, steam_app_id, image_url")
    .eq("steam_app_id", appId)
    .maybeSingle();

  if (error) return json(request, { error: error.message }, 500);

  return json(request, {
    ok: true,
    exists: Boolean(data),
    game: data || null,
  });
}

export async function POST(request) {
  if (!supabaseUrl || !publishableKey) {
    return json(request, { error: "Server Supabase configuration is missing." }, 500);
  }

  const token = getBearer(request);
  if (!token) return json(request, { error: "Authorization token is required." }, 401);

  const supabase = clientForToken(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return json(request, { error: "Invalid or expired session." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON body." }, 400);
  }

  const appId = String(payload?.appId || "").trim();
  const title = String(payload?.title || "").trim();
  const steamUrl = String(payload?.steamUrl || "").trim();
  const description = String(payload?.description || "").trim();
  const imageUrl = String(payload?.imageUrl || "").trim();

  if (!/^\d+$/.test(appId)) return json(request, { error: "Invalid Steam App ID." }, 400);
  if (!title || title.length > 200) return json(request, { error: "Invalid game title." }, 400);
  if (!isSteamUrl(steamUrl)) return json(request, { error: "Invalid Steam URL." }, 400);
  if (description.length > 5000) return json(request, { error: "Description is too long." }, 400);
  if (!isSteamImageUrl(imageUrl)) return json(request, { error: "Invalid Steam image URL." }, 400);

  const { data: existing, error: existingError } = await supabase
    .from("games")
    .select("id, title, steam_app_id, image_url")
    .eq("steam_app_id", appId)
    .maybeSingle();

  if (existingError) return json(request, { error: existingError.message }, 500);

  if (existing) {
    return json(request, { ok: true, alreadyExists: true, game: existing }, 409);
  }

  let imageResponse;
  try {
    imageResponse = await fetch(imageUrl, { headers: { "User-Agent": "SteamGameCatalog/1.0" } });
  } catch {
    return json(request, { error: "Could not download the Steam image." }, 502);
  }

  if (!imageResponse.ok) {
    return json(request, { error: `Steam image returned HTTP ${imageResponse.status}.` }, 502);
  }

  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return json(request, { error: "Steam image is not an image file." }, 400);
  }

  const bytes = await imageResponse.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return json(request, { error: "Steam image is larger than 8 MB." }, 413);
  }

  const extension =
    contentType === "image/png" ? "png" :
    contentType === "image/webp" ? "webp" :
    contentType === "image/avif" ? "avif" : "jpg";

  const storagePath = `steam/${appId}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, new Blob([bytes], { type: contentType }), {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) return json(request, { error: uploadError.message }, 500);

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;

  const { data: maxRow } = await supabase
    .from("games")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertError } = await supabase
    .from("games")
    .insert({
      title,
      description,
      steam_url: steamUrl,
      image_url: publicUrl,
      steam_app_id: appId,
      source: "steam",
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select("*")
    .single();

  if (insertError) {
    await supabase.storage.from(bucket).remove([storagePath]);
    return json(request, { error: insertError.message }, 500);
  }

  return json(request, { ok: true, alreadyExists: false, game: inserted });
}
