import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const bucket = "game-images";

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin =
    origin.startsWith("chrome-extension://") ? origin : "null";

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
      url.hostname === "store.steampowered.com"
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
      (
        url.hostname === "steamcdn-a.akamaihd.net" ||
        url.hostname.endsWith(".steamstatic.com") ||
        url.hostname.endsWith(".akamaihd.net")
      )
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
  if (!supabaseUrl || !publishableKey) {
    return json(
      request,
      { error: "Server Supabase configuration is missing." },
      500
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!tokenMatch) {
    return json(
      request,
      { error: "Authorization token is required." },
      401
    );
  }

  const accessToken = tokenMatch[1].trim();

  // Используем publishable key + токен администратора.
  // Secret/service_role ключ здесь больше НЕ нужен.
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return json(
      request,
      { error: "Invalid or expired session." },
      401
    );
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

  if (!/^\d+$/.test(appId)) {
    return json(request, { error: "Invalid Steam App ID." }, 400);
  }

  if (!title || title.length > 200) {
    return json(request, { error: "Invalid game title." }, 400);
  }

  if (!isSteamUrl(steamUrl)) {
    return json(request, { error: "Invalid Steam URL." }, 400);
  }

  if (description.length > 5000) {
    return json(request, { error: "Description is too long." }, 400);
  }

  if (!isSteamImageUrl(imageUrl)) {
    return json(request, { error: "Invalid Steam image URL." }, 400);
  }

  // Проверяем дубликат.
  const { data: existing, error: existingError } = await supabase
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

  // Копируем картинку Steam в наш Storage.
  let imageResponse;

  try {
    imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "SteamGameCatalog/1.0",
      },
    });
  } catch {
    return json(
      request,
      { error: "Could not download the Steam image." },
      502
    );
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
    return json(
      request,
      { error: "Steam image is not an image file." },
      400
    );
  }

  const imageBytes = await imageResponse.arrayBuffer();

  if (imageBytes.byteLength > 8 * 1024 * 1024) {
    return json(
      request,
      { error: "Steam image is larger than 8 MB." },
      413
    );
  }

  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/avif"
          ? "avif"
          : "jpg";

  const storagePath =
    `steam/${appId}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(
      storagePath,
      new Blob([imageBytes], { type: contentType }),
      {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      }
    );

  if (uploadError) {
    return json(request, { error: uploadError.message }, 500);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  // Берём максимальный sort_order.
  const { data: maxRow } = await supabase
    .from("games")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertError } = await supabase
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
    await supabase.storage
      .from(bucket)
      .remove([storagePath]);

    return json(
      request,
      { error: insertError.message },
      500
    );
  }

  return json(request, {
    ok: true,
    alreadyExists: false,
    game: inserted,
  });
}
