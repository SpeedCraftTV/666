const allowedOrigins = new Set([
  "https://speedcrafttv.github.io",
  "http://localhost:8000",
  "http://localhost:8765",
  "http://localhost:5500",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:5500",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

async function hashRateLimitKey(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`contact:${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { error: "Origine non autorisée." }, origin);
    }
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(403, { error: "Origine non autorisée." }, origin);
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." }, origin);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Formulaire invalide." }, origin);
  }
  if (
    typeof payload !== "object" || payload === null || Array.isArray(payload)
  ) {
    return jsonResponse(400, { error: "Formulaire invalide." }, origin);
  }

  const input = payload as Record<string, unknown>;
  if (typeof input.company === "string" && input.company.trim()) {
    return jsonResponse(200, { ok: true }, origin);
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const message = typeof input.message === "string"
    ? input.message.trim()
    : "";
  if (
    name.length < 1 || name.length > 80 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    message.length < 1 || message.length > 5000
  ) {
    return jsonResponse(400, {
      error: "Vérifie le nom, l’adresse e-mail et le message.",
    }, origin);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const senderEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const rateLimitSecret = Deno.env.get("RATE_LIMIT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (
    !resendApiKey || !senderEmail || !rateLimitSecret || !supabaseUrl ||
    !serviceRoleKey
  ) {
    console.error("Missing contact-email or rate-limit secrets.");
    return jsonResponse(503, {
      error: "Le service de contact n’est pas encore configuré.",
    }, origin);
  }

  const ip = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip");
  if (!ip) {
    return jsonResponse(503, {
      error: "Le service de contact est temporairement indisponible.",
    }, origin);
  }

  try {
    const rateResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/claim_blog_report_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_rate_key: await hashRateLimitKey(ip, rateLimitSecret),
        }),
      },
    );
    if (!rateResponse.ok) {
      console.error(
        "Contact rate-limit check failed:",
        rateResponse.status,
        await rateResponse.text(),
      );
      return jsonResponse(500, {
        error: "Impossible de vérifier la limite d’envoi.",
      }, origin);
    }
    if (!await rateResponse.json()) {
      return jsonResponse(429, {
        error: "Attends une minute avant d’envoyer un autre message.",
      }, origin);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderEmail,
        to: ["minicastorbot@gmail.com"],
        reply_to: email,
        subject: "Nouveau message du site Mini Castor",
        text: `Nom ou pseudo : ${name}\nE-mail : ${email}\n\nMessage :\n${message}`,
      }),
    });
    if (!emailResponse.ok) {
      console.error(
        "Resend rejected a contact email:",
        emailResponse.status,
        await emailResponse.text(),
      );
      return jsonResponse(502, {
        error: "L’e-mail n’a pas pu être envoyé. Réessaie dans un instant.",
      }, origin);
    }
    return jsonResponse(200, { ok: true }, origin);
  } catch (error) {
    console.error("Could not send contact email:", error);
    return jsonResponse(500, {
      error: "Une erreur est survenue pendant l’envoi du message.",
    }, origin);
  }
});
