// Winery Survivors Cellar: the whole app. Data lives in Supabase (see setup.sql).
const WINERIES = ["Riesling Freak","Langmeil","Z Wine","Hentley Farm","Max and Me","Henschke","Poonawatta","Soul Growers","Shut the Gate","Pikes","Kilikanoon","O'Leary Walker","Pike & Joyce","Somewhere else"];
const BUY = { yes: "Buy more", maybe: "Maybe", no: "Don't bother" };

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const show = (id, on) => { $(id).hidden = !on; };

// A join link looks like https://…/winery-survivors-cellar/?join=CODE
let joinCode = null;
try {
  const q = new URLSearchParams(location.search).get("join");
  if (q) { joinCode = q; localStorage.setItem("cellar-join", q); }
  else joinCode = localStorage.getItem("cellar-join");
} catch (e) { joinCode = new URLSearchParams(location.search).get("join"); }

let sb = null, me = null, wines = [], reviews = [], openRate = null, confirmDel = null;

function flash(text, isErr) {
  const m = $("msg"); m.textContent = text || ""; m.className = "status" + (isErr ? " err" : ""); m.hidden = !text;
}

/* ---------- sign in ---------- */
async function boot() {
  const cfg = window.CELLAR_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.startsWith("PASTE")) {
    $("boot").textContent = "The site isn't connected to its database yet. Jonny needs to fill in config.js.";
    $("boot").className = "status err"; return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.onAuthStateChange((_evt, session) => { route(session); });
  const { data } = await sb.auth.getSession();
  route(data.session);
}

let routing = null;
async function route(session) {
  const key = session ? session.user.id : "none";
  if (routing === key) return; routing = key;
  show("boot", false);
  if (!session) { me = null; show("app", false); show("denied", false); show("join", false); show("login", true); return; }
  show("login", false);
  const email = (session.user.email || "").toLowerCase();
  const { data, error } = await sb.from("crew").select("name,email");
  const row = (data || []).find(r => r.email.toLowerCase() === email);
  if (error || !row) {
    show("app", false);
    if (joinCode) { show("denied", false); show("join", true); $("join-name").focus(); return; }
    $("denied-text").textContent = "You're signed in as " + (session.user.email || "an unknown email") + ", but you need the join link from Jonny. Open it, then sign in again.";
    show("join", false); show("denied", true); return;
  }
  try { localStorage.removeItem("cellar-join"); } catch (e) {}
  if (location.search) history.replaceState(null, "", location.pathname);
  me = row.name;
  $("who").textContent = "Signed in as " + me;
  show("denied", false); show("join", false); show("app", true);
  await load();
}

$("login-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const st = $("login-status"); st.className = "status"; st.textContent = "Sending…";
  $("login-btn").disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email: $("email").value.trim(),
    options: { emailRedirectTo: location.origin + location.pathname + (joinCode ? "?join=" + encodeURIComponent(joinCode) : "") }
  });
  $("login-btn").disabled = false;
  if (error) { st.className = "status err"; st.textContent = "Couldn't send the link: " + error.message; }
  else st.textContent = "Check your email and tap the link. It may take a minute, and check your junk folder.";
});
$("join-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const st = $("join-status"); st.className = "status"; st.textContent = "Joining…";
  $("join-btn").disabled = true;
  const { error } = await sb.rpc("join_crew", { code: joinCode, display_name: $("join-name").value.trim() });
  $("join-btn").disabled = false;
  if (error) { st.className = "status err"; st.textContent = error.message; return; }
  st.textContent = "";
  const { data } = await sb.auth.getSession();
  routing = null; route(data.session);
});
const signOut = async () => { await sb.auth.signOut(); routing = null; route(null); };
$("signout").onclick = signOut; $("denied-out").onclick = signOut;

/* ---------- data ---------- */
async function load() {
  const [w, r] = await Promise.all([
    sb.from("wines").select("*"),
    sb.from("reviews").select("*")
  ]);
  if (w.error || r.error) { flash("Couldn't load the reviews. Reload the page to try again.", true); return; }
  wines = w.data; reviews = r.data; flash("");
  render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && me) load(); });

function statsFor(id) {
  const rs = reviews.filter(r => r.wine_id === id);
  const avg = rs.length ? rs.reduce((s, r) => s + r.stars, 0) / rs.length : 0;
  const tally = { yes: 0, maybe: 0, no: 0 }; rs.forEach(r => { tally[r.buy]++; });
  return { rs, avg, tally };
}
const starStr = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

function render() {
  const list = $("list"); list.replaceChildren();
  const filter = $("filter").value, sort = $("sort").value;
  const rows = wines.filter(w => !filter || w.winery === filter).map(w => ({ w, s: statsFor(w.id) }));
  const cmp = {
    score: (a, b) => b.s.avg - a.s.avg || b.s.rs.length - a.s.rs.length,
    buy: (a, b) => (b.s.tally.yes - b.s.tally.no) - (a.s.tally.yes - a.s.tally.no) || b.s.avg - a.s.avg,
    new: (a, b) => new Date(b.w.created_at) - new Date(a.w.created_at),
    winery: (a, b) => a.w.winery.localeCompare(b.w.winery) || a.w.name.localeCompare(b.w.name)
  }[sort];
  rows.sort(cmp);

  if (!rows.length) {
    const e = el("div", "empty panel");
    e.append(el("h2", null, wines.length ? "No bottles from this winery yet" : "The cellar's empty so far"));
    e.append(el("p", null, wines.length ? "Pick another winery, or add one you bought here." : "Tap “Add a bottle” for each wine you brought home. Everyone can rate every bottle once it's in."));
    list.append(e); return;
  }

  rows.forEach(({ w, s }, i) => {
    const ranked = sort === "score" || sort === "buy";
    const card = el("article", "wine" + (ranked && i === 0 && s.rs.length ? " top" : ""));
    card.append(el("div", "rank", String(i + 1)));
    const body = el("div", "body");
    body.append(el("div", "winery", w.winery));
    body.append(el("h3", null, (w.vintage ? w.vintage + " " : "") + w.name));
    const bits = [];
    if (w.price != null) bits.push("A$" + Number(w.price).toFixed(2).replace(/\.00$/, "") + " a bottle");
    if (w.bottles) bits.push(w.bottles + (w.bottles == 1 ? " bottle" : " bottles"));
    if (w.added_by) bits.push("added by " + w.added_by);
    if (bits.length) body.append(el("div", "meta", bits.join(" · ")));

    const sc = el("div", "score");
    if (s.rs.length) {
      sc.append(el("span", "stars", starStr(s.avg)));
      sc.append(el("span", "avg", s.avg.toFixed(1) + " from " + s.rs.length + (s.rs.length === 1 ? " review" : " reviews")));
      ["yes", "maybe", "no"].forEach(k => { if (s.tally[k]) sc.append(el("span", "pill " + k, BUY[k] + " ×" + s.tally[k])); });
      if (s.rs.length >= 2 && s.tally.yes > s.rs.length / 2) sc.append(el("span", "pill verdict", "Reorder this one"));
    } else sc.append(el("span", "meta", "No reviews yet"));
    body.append(sc);

    if (s.rs.length) {
      const rv = el("div", "reviews");
      s.rs.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).forEach(r => {
        const p = el("div", "rev");
        p.append(el("b", null, r.reviewer));
        p.append(document.createTextNode(" " + "★".repeat(r.stars) + " · " + BUY[r.buy]));
        if (r.note) { p.append(document.createTextNode(" · ")); p.append(el("span", "note", "“" + r.note + "”")); }
        rv.append(p);
      });
      body.append(rv);
    }

    const acts = el("div", "actions");
    const mine = s.rs.find(r => r.reviewer === me);
    const rb = el("button", "btn small", mine ? "Edit my review" : "Rate this wine"); rb.type = "button";
    rb.onclick = () => { openRate = openRate === w.id ? null : w.id; render(); };
    acts.append(rb);
    if (confirmDel === w.id) {
      const yes = el("button", "btn small ghost", "Yes, remove it and its reviews"); yes.type = "button";
      yes.onclick = () => removeWine(w.id);
      const no = el("button", "linkish", "Keep it"); no.type = "button"; no.onclick = () => { confirmDel = null; render(); };
      acts.append(yes, no);
    } else {
      const d = el("button", "linkish", "Remove bottle"); d.type = "button"; d.onclick = () => { confirmDel = w.id; render(); };
      acts.append(d);
    }
    body.append(acts);
    if (openRate === w.id) body.append(rateForm(w, mine));
    card.append(body);
    list.append(card);
  });
}

function rateForm(w, mine) {
  let stars = mine ? mine.stars : 0, buy = mine ? mine.buy : "";
  const f = el("div", "rate");
  f.append(el("div", "label", "Your score, " + me));
  const sp = el("div", "starpick");
  const paint = () => [...sp.children].forEach((b, i) => b.classList.toggle("on", i < stars));
  for (let i = 1; i <= 5; i++) {
    const b = el("button", null, "★"); b.type = "button"; b.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : ""));
    b.onclick = () => { stars = i; paint(); }; sp.append(b);
  }
  paint(); f.append(sp);
  f.append(el("div", "label", "Buy more of it?"));
  const seg = el("div", "seg");
  Object.entries(BUY).forEach(([k, v]) => {
    const b = el("button", null, v); b.type = "button"; b.setAttribute("aria-pressed", String(buy === k));
    b.onclick = () => { buy = k; [...seg.children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
    seg.append(b);
  });
  f.append(seg);
  const ta = el("textarea"); ta.id = "note-" + w.id; ta.maxLength = 400; ta.setAttribute("aria-label", "Tasting notes");
  ta.placeholder = "Tasting notes, what you ate with it, who drank most of it…";
  ta.value = mine && mine.note ? mine.note : "";
  f.append(ta);
  const row = el("div", "actions");
  const save = el("button", "btn small", "Save review"); save.type = "button";
  const st = el("span", "status");
  save.onclick = async () => {
    if (!stars) { st.textContent = "Pick a star score first."; st.className = "status err"; return; }
    if (!buy) { st.textContent = "Say whether you'd buy more."; st.className = "status err"; return; }
    save.disabled = true; st.className = "status"; st.textContent = "Saving…";
    const { error } = await sb.from("reviews").upsert({
      wine_id: w.id, reviewer: me, stars, buy, note: ta.value.trim() || null, updated_at: new Date().toISOString()
    });
    if (error) { save.disabled = false; st.className = "status err"; st.textContent = "Couldn't save just now. Try again."; return; }
    openRate = null; await load();
  };
  const cancel = el("button", "linkish", "Cancel"); cancel.type = "button"; cancel.onclick = () => { openRate = null; render(); };
  row.append(save, cancel, st); f.append(row);
  return f;
}

async function removeWine(id) {
  const { error } = await sb.from("wines").delete().eq("id", id);
  confirmDel = null;
  if (error) flash("Couldn't remove that bottle. Try again.", true);
  await load();
}

/* ---------- add a bottle ---------- */
function fillSelects() {
  const w = $("f-winery"); w.replaceChildren(new Option("Choose a winery", ""));
  WINERIES.forEach(x => w.add(new Option(x, x)));
  const f = $("filter"); f.replaceChildren(new Option("All wineries", ""));
  WINERIES.forEach(x => f.add(new Option(x, x)));
}
$("show-add").onclick = () => { show("add-panel", true); $("f-winery").focus(); };
$("add-cancel").onclick = () => { show("add-panel", false); $("add-form").reset(); $("add-status").textContent = ""; };
$("add-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const st = $("add-status"); st.className = "status";
  const vintage = $("f-vintage").value.trim(), price = $("f-price").value.trim().replace(/^\$/, ""), bottles = $("f-bottles").value.trim();
  const bad = t => { st.textContent = t; st.className = "status err"; };
  if (vintage && !/^(19|20)\d\d$/.test(vintage)) return bad("Vintage should be a year like 2021, or blank for NV.");
  if (price && !/^\d+(\.\d{1,2})?$/.test(price)) return bad("Price should be a number like 35 or 42.50.");
  if (bottles && !/^\d{1,3}$/.test(bottles)) return bad("Bottles should be a whole number.");
  $("add-btn").disabled = true; st.textContent = "Adding…";
  const { error } = await sb.from("wines").insert({
    winery: $("f-winery").value, name: $("f-name").value.trim(),
    vintage: vintage || null, price: price ? Number(price) : null, bottles: bottles ? Number(bottles) : null, added_by: me
  });
  $("add-btn").disabled = false;
  if (error) return bad("Couldn't add it just now. Try again.");
  $("add-form").reset(); show("add-panel", false); st.textContent = "";
  await load();
});
$("filter").onchange = render; $("sort").onchange = render;

fillSelects();
boot();
