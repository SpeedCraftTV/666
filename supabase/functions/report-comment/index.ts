const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

async function serviceRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase function secrets are not configured.");
  }

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  replyTo: string,
  subject: string,
  text: string,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Resend rejected an email:", response.status, error);
    throw new Error("Email delivery failed.");
  }
}

async function hashRateLimitKey(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function getAuthenticatedUser(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (
    !authorization?.startsWith("Bearer ") || !supabaseUrl || !serviceRoleKey
  ) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;

  const user: unknown = await response.json();
  return typeof user === "object" && user !== null && !Array.isArray(user)
    ? user as Record<string, unknown>
    : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Formulaire invalide." });
  }
  if (
    typeof payload !== "object" || payload === null || Array.isArray(payload)
  ) {
    return jsonResponse(400, { error: "Formulaire invalide." });
  }
  const input = payload as Record<string, unknown>;

  if (typeof input.company === "string" && input.company.trim()) {
    return jsonResponse(200, { ok: true });
  }

  const commentId = typeof input.comment_id === "string"
    ? input.comment_id
    : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(commentId) ||
    message.length < 1 || message.length > 2000
  ) {
    return jsonResponse(400, {
      error: "Vérifie le message du signalement.",
    });
  }

  let user: Record<string, unknown> | null;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error("Could not verify report user:", error);
    return jsonResponse(503, {
      error: "Impossible de vérifier ton compte pour le moment.",
    });
  }
  const userId = typeof user?.id === "string" ? user.id : "";
  const reporterEmail = typeof user?.email === "string"
    ? user.email.trim()
    : "";
  const userMetadata = typeof user?.user_metadata === "object" &&
      user.user_metadata !== null && !Array.isArray(user.user_metadata)
    ? user.user_metadata as Record<string, unknown>
    : {};
  const reporterNameCandidate = userMetadata.nickname ?? userMetadata.name;
  const reporterName = typeof reporterNameCandidate === "string"
    ? reporterNameCandidate.trim().slice(0, 80)
    : reporterEmail.split("@")[0].slice(0, 80);
  if (!userId || !reporterEmail || !reporterName) {
    return jsonResponse(401, {
      error: "Connecte-toi à ton compte pour signaler un commentaire.",
    });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const senderEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const reportsInbox = Deno.env.get("REPORTS_INBOX_EMAIL");
  const rateLimitSecret = Deno.env.get("RATE_LIMIT_SECRET");
  if (!resendApiKey || !senderEmail || !reportsInbox || !rateLimitSecret) {
    console.error("Missing report email or rate-limit secrets.");
    return jsonResponse(503, {
      error: "Le service de signalement par e-mail n’est pas encore configuré.",
    });
  }

  try {
    const ip = request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip");
    if (!ip) {
      return jsonResponse(503, {
        error: "Le service de signalement est temporairement indisponible.",
      });
    }
    const rateKey = await hashRateLimitKey(ip, rateLimitSecret);
    const rateResponse = await serviceRequest(
      "rpc/claim_blog_report_rate_limit",
      {
        method: "POST",
        body: JSON.stringify({ p_rate_key: rateKey }),
      },
    );
    if (!rateResponse.ok) {
      console.error(
        "Report rate-limit check failed:",
        rateResponse.status,
        await rateResponse.text(),
      );
      return jsonResponse(500, {
        error: "Impossible de vérifier la limite de signalements.",
      });
    }
    if (!await rateResponse.json()) {
      return jsonResponse(429, {
        error: "Attends une minute avant d’envoyer un autre signalement.",
      });
    }

    const commentQuery = new URLSearchParams({
      select: "post_id,author_name,body",
      id: `eq.${commentId}`,
      limit: "1",
    });
    const commentResponse = await serviceRequest(
      `blog_comments?${commentQuery}`,
    );
    if (!commentResponse.ok) {
      console.error(
        "Could not load reported comment:",
        commentResponse.status,
        await commentResponse.text(),
      );
      return jsonResponse(500, {
        error: "Impossible de retrouver le commentaire signalé.",
      });
    }
    const comments = await commentResponse.json();
    const comment = comments[0];
    if (!comment) {
      return jsonResponse(404, { error: "Ce commentaire n’existe plus." });
    }

    const reportResponse = await serviceRequest("blog_comment_reports", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        comment_id: commentId,
        visitor_id: userId,
        user_id: userId,
        reporter_name: reporterName,
        reporter_email: reporterEmail,
        message,
      }),
    });
    if (!reportResponse.ok) {
      const error = await reportResponse.text();
      console.error("Could not save report:", reportResponse.status, error);
      const duplicate = reportResponse.status === 409;
      return jsonResponse(duplicate ? 409 : 500, {
        error: duplicate
          ? "Tu as déjà signalé ce commentaire avec ce compte."
          : "Impossible d’enregistrer le signalement.",
      });
    }

    const reportText = [
      "Un commentaire a été signalé sur le blogue.",
      "",
      `Article : ${comment.post_id}`,
      `Pseudo du signalant : ${reporterName}`,
      `E-mail de contact : ${reporterEmail}`,
      `Message : ${message}`,
      "",
      `Commentaire signalé par ${comment.author_name} :`,
      comment.body,
    ].join("\n");

    try {
      await Promise.all([
        sendEmail(
          resendApiKey,
          senderEmail,
          reportsInbox,
          reporterEmail,
          "Nouveau signalement de commentaire",
          reportText,
        ),
        sendEmail(
          resendApiKey,
          senderEmail,
          reporterEmail,
          reportsInbox,
          "Copie de ton signalement",
          `Voici une copie du signalement que tu as envoyé :\n\n${reportText}`,
        ),
      ]);
    } catch {
      return jsonResponse(502, {
        error:
          "Le signalement est enregistré, mais au moins un courriel n’a pas pu être envoyé. Contacte le site si nécessaire.",
      });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Report submission failed:", error);
    return jsonResponse(500, {
      error: "Une erreur est survenue pendant le traitement du signalement.",
    });
  }
});
