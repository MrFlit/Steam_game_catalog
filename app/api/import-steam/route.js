import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const bucket = "game-images";

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = origin.startsWith("chrome-extension://")
    ? origin
    : "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function isSteamUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "store.steampowered.com" ||
        url.hostname === "steamcommunity.com")
    );
  } catch {
    return false;
  }
}

function isSteamImageUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "steamcdn-a.akamaihd.net" ||
        url.hostname.endsWith(".steamstatic.com") ||
        url.hostname.endsWith(".akamaihd.net"))
    );
  } catch {
    return false;
  }
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function POST(request) {
  if (!supabaseUrl || !publicKey || !secretKey) {
    return json(request, { error: "Server Supabase configuration is missing." }, 500);
  }

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json(request, { error: "Authorization token is required." }, 401);
  }

  const accessToken = match[1].trim();

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: userData, error: userError } =
    await userClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return json(request, { error: "Invalid or expired session." }, 401);
  }

  // This client is server-only. NEVER expose SUPABASE_SECRET_KEY to the browser.
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

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

  if (!/^\d+$/.test(appId)) {
    return json(request, { error: "Invalid Steam App ID." }, 400);
  }

  if (!title || title.length > 200) {
    return json(request, { error: "Invalid game title." }, 400);
  }

  if (!steamUrl || !isSteamUrl(steamUrl)) {
    return json(request, { error: "Invalid Steam URL." }, 400);
  }

  if (description.length > 5000) {
    return json(request, { error: "Description is too long." }, 400);
  }

  if (!imageUrl || !isSteamImageUrl(imageUrl)) {
    return json(request, { error: "Invalid Steam image URL." }, 400);
  }

  // Prevent duplicate imports.
  const { data: existing, error: existingError } = await adminClient
    .from("games")
    .select("id, title, steam_app_id, image_url")
    .eq("steam_app_id", appId)
    .maybeSingle();

  if (existingError) {
    return json(request, { error: existingError.message }, 500);
  }

  if (existing) {
    return json(
      request,
      {
        ok: true,
        alreadyExists: true,
        game: existing,
      },
      409
    );
  }

  // Download the Steam image and store a copy in our own Supabase bucket.
  let imageResponse;

  try {
    imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "SteamGameCatalog/1.0",
      },
    });
  } catch {
    return json(request, { error: "Could not download the Steam image." }, 502);
  }

  if (!imageResponse.ok) {
    return json(
      request,
      { error: `Steam image returned HTTP ${imageResponse.status}.` },
      502
    );
  }

  const contentType =
    imageResponse.headers.get("content-type") || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    return json(request, { error: "Steam image is not an image file." }, 400);
  }

  const contentLength = Number(
    imageResponse.headers.get("content-length") || "0"
  );

  if (contentLength > 8 * 1024 * 1024) {
    return json(request, { error: "Steam image is larger than 8 MB." }, 413);
  }

  const imageBytes = await imageResponse.arrayBuffer();

  if (imageBytes.byteLength > 8 * 1024 * 1024) {
    return json(request, { error: "Steam image is larger than 8 MB." }, 413);
  }

  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/avif"
          ? "avif"
          : "jpg";

  const storagePath = `steam/${appId}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await adminClient.storage
    .from(bucket)
    .upload(storagePath, Buffer.from(imageBytes), {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return json(request, { error: uploadError.message }, 500);
  }

  const { data: publicUrlData } = adminClient.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  const { data: maxRow } = await adminClient
    .from("games")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertError } = await adminClient
    .from("games")
    .insert({
      title,
      description,
      steam_url: steamUrl,
      image_url: publicUrlData.publicUrl,
      steam_app_id: appId,
      source: "steam",
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (insertError) {
    await adminClient.storage.from(bucket).remove([storagePath]);
    return json(request, { error: insertError.message }, 500);
  }

  return json(request, {
    ok: true,
    alreadyExists: false,
    game: inserted,
  });
}
