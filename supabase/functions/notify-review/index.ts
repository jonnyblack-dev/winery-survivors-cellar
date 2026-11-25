// Winery Survivors Cellar: email the crew when someone posts a new review.
// Deployed as the Supabase Edge Function "notify-review".
// Needs two secrets (Edge Functions > Secrets): GMAIL_USER and GMAIL_APP_PASSWORD.
// Only people in public.crew are emailed, never other users of the project.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

const SITE = "https://jonnyblack-dev.github.io/winery-survivors-cellar/";
const BUY: Record<string, string> = { yes: "Buy more", maybe: "Maybe", no: "Don't bother" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  console.log("notify-review called");
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Who is asking? They must be signed in and on the crew list.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user?.email) { console.log("Rejected: not signed in"); return json({ error: "Not signed in" }, 401); }
    const { data: crew, error: crewErr } = await admin.from("crew").select("name, email, notify");
    if (crewErr || !crew) return json({ error: "Couldn't read the crew list" }, 500);
    if (!crew.some((c) => c.email.toLowerCase() === user.email!.toLowerCase())) return json({ error: "Not in the crew" }, 403);

    const { wine_id, reviewer } = await req.json();
    if (!wine_id || !reviewer) return json({ error: "Missing review" }, 400);

    // Claim the review so it is only ever announced once.
    const { data: claimed } = await admin.from("reviews")
      .update({ notified_at: new Date().toISOString() })
      .eq("wine_id", wine_id).eq("reviewer", reviewer).is("notified_at", null)
      .select("*");
    if (!claimed?.length) { console.log("Skipped: review already announced", wine_id, reviewer); return json({ skipped: "Already announced" }); }
    const r = claimed[0];
    const { data: w } = await admin.from("wines").select("*").eq("id", wine_id).single();
    if (!w) return json({ error: "Bottle not found" }, 404);

    const to = crew.filter((c) => c.notify !== false && c.name !== r.reviewer).map((c) => c.email);
    if (!to.length) return json({ sent: 0 });

    const wine = `${w.vintage ? w.vintage + " " : ""}${w.name}`;
    const stars = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
    const subject = `🍷 ${r.reviewer} reviewed ${wine} (${w.winery})`;
    const text = [
      `${r.reviewer} just reviewed ${wine} from ${w.winery}.`,
      ``,
      `${stars}  ·  ${BUY[r.buy] ?? ""}`,
      r.note ? `\n"${r.note}"\n` : ``,
      `See it and add your own: ${SITE}`,
      ``,
      `(To stop these emails, untick "Email me about new reviews" at the top of the site.)`,
    ].join("\n");
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#231a22">
<p><b>${esc(r.reviewer)}</b> just reviewed <b>${esc(wine)}</b> from ${esc(w.winery)}.</p>
<p style="font-size:18px;color:#b08516">${stars} <span style="font-size:15px;color:#231a22">· ${esc(BUY[r.buy] ?? "")}</span></p>
${r.note ? `<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #7d1f3a;color:#6c6170;white-space:pre-line">${esc(r.note)}</blockquote>` : ""}
<p><a href="${SITE}" style="color:#7d1f3a;font-weight:600">Open the Winery Survivors Cellar</a></p>
<p style="font-size:12px;color:#6c6170">To stop these emails, untick "Email me about new reviews" at the top of the site.</p></div>`;

    const gmailUser = Deno.env.get("GMAIL_USER")!;
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: Deno.env.get("GMAIL_APP_PASSWORD")! },
    });
    // One email, everyone in BCC so addresses stay private.
    await transport.sendMail({ from: `"Winery Survivors Cellar" <${gmailUser}>`, to: gmailUser, bcc: to, subject, text, html });
    console.log("Emailed", to.length, "crew about", reviewer + "'s review");
    return json({ sent: to.length });
  } catch (e) {
    console.error("notify-review failed:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
