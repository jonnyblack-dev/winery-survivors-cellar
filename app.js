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

let myId = null, photoUrls = {}, isAdmin = false, editingWine = null;
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
  // Supabase holds a lock while this callback runs, so any database call made
  // inside it waits forever. Defer the work until the callback has returned.
  sb.auth.onAuthStateChange((_evt, session) => { setTimeout(() => route(session), 0); });
}

// Give up on a request that hangs, so the page can say so instead of sitting still.
function withTimeout(promise, ms = 15000) {
  return Promise.race([promise, new Promise(res => setTimeout(() => res({ error: { message: "timeout" } }), ms))]);
}

let routing = null;
async function route(session) {
  const key = session ? session.user.id : "none";
  if (routing === key) return; routing = key;
  show("boot", false);
  if (!session) { me = null; show("app", false); show("denied", false); show("join", false); show("login", true); return; }
  show("login", false);
  const email = (session.user.email || "").toLowerCase();
  const { data, error } = await withTimeout(sb.from("crew").select("*"));
  if (error) {
    show("app", false); show("join", false);
    $("denied-text").textContent = error.message === "timeout"
      ? "The cellar isn't answering. Check your internet connection and reload the page."
      : "The cellar couldn't check the crew list (" + error.message + "). Let Jonny know.";
    $("denied-h").textContent = "Something went wrong";
    show("denied", true); routing = null; return;
  }
  const row = (data || []).find(r => r.email.toLowerCase() === email);
  if (!row) {
    show("app", false);
    if (joinCode) { show("denied", false); show("join", true); $("join-name").focus(); return; }
    $("denied-h").textContent = "You're not in the crew yet";
    $("denied-text").textContent = "You're signed in as " + (session.user.email || "an unknown email") + ", but you need the join link from Jonny. Open it, then sign in again.";
    show("join", false); show("denied", true); return;
  }
  try { localStorage.removeItem("cellar-join"); } catch (e) {}
  if (location.search) history.replaceState(null, "", location.pathname);
  me = row.name; myId = session.user.id; isAdmin = row.is_admin === true;
  $("who").textContent = "Signed in as " + me + (isAdmin ? " · admin" : "");
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
  const st = $("join-status"), btn = $("join-btn"), name = $("join-name").value.trim();
  if (!name) { st.className = "status err"; st.textContent = "Type your first name first."; return; }
  if (!joinCode) { st.className = "status err"; st.textContent = "This page lost the join code. Open the join link from Jonny again."; return; }
  btn.disabled = true; btn.textContent = "Joining…"; st.className = "status"; st.textContent = "Adding you to the crew…";
  const { error } = await withTimeout(sb.rpc("join_crew", { code: joinCode, display_name: name }));
  if (error) {
    btn.disabled = false; btn.textContent = "Join";
    st.className = "status err";
    st.textContent = error.message === "timeout"
      ? "That's taking too long. Check your internet connection and try again."
      : error.message || "Something went wrong. Try again.";
    return;
  }
  st.className = "status ok"; st.textContent = "Welcome aboard, " + name + "! Opening the cellar…";
  const { data } = await sb.auth.getSession();
  routing = null;
  setTimeout(() => { btn.disabled = false; btn.textContent = "Join"; st.textContent = ""; route(data.session); }, 900);
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
  await signPhotos();
  render();
}
/* ---------- photos ---------- */
const BUCKET = "wine-photos";
// The bucket is private, so each photo needs a short-lived signed link.
async function signPhotos() {
  const paths = [...wines, ...reviews].map(r => r.photo_path).filter(p => p && !photoUrls[p]);
  if (!paths.length) return;
  const { data, error } = await withTimeout(sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6));
  if (error || !data) return;
  data.forEach(d => { if (d.signedUrl && d.path) photoUrls[d.path] = d.signedUrl; });
}
// Shrink a phone photo to at most 1280px on its long side, as a JPEG.
async function shrinkPhoto(file) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("shrink")), "image/jpeg", 0.8));
}
function photoEl(path, cls, alt) {
  const url = path && photoUrls[path];
  if (!url) return null;
  const a = el("a", cls); a.href = url; a.target = "_blank"; a.rel = "noopener";
  const img = el("img"); img.src = url; img.alt = alt; img.loading = "lazy";
  a.append(img); return a;
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
    // The bottle's own photo, or else the newest photo from a review.
    if (w.photo_path && photoUrls[w.photo_path]) body.append(photoEl(w.photo_path, "hero-photo", "Photo of " + w.name));
    else {
      const withPhoto = s.rs.filter(r => r.photo_path && photoUrls[r.photo_path])
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
      if (withPhoto) body.append(photoEl(withPhoto.photo_path, "hero-photo", "Photo of " + w.name + " by " + withPhoto.reviewer));
    }
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
        const th = photoEl(r.photo_path, "thumb", r.reviewer + "'s photo");
        if (th) p.append(th);
        p.append(el("b", null, r.reviewer));
        p.append(document.createTextNode(" " + "★".repeat(r.stars) + " · " + BUY[r.buy]));
        if (r.note) { p.append(document.createTextNode(" · ")); p.append(el("span", "note", "“" + r.note + "”")); }
        if (isAdmin && r.reviewer !== me) {
          const ed = el("button", "linkish", "Edit"); ed.type = "button";
          ed.setAttribute("aria-label", "Edit " + r.reviewer + "'s review");
          const key = w.id + "|" + r.reviewer;
          ed.onclick = () => { openRate = openRate === key ? null : key; render(); };
          p.append(ed);
        }
        rv.append(p);
      });
      body.append(rv);
    }

    const acts = el("div", "actions");
    const mine = s.rs.find(r => r.reviewer === me);
    const rb = el("button", "btn small", mine ? "Edit my review" : "Rate this wine"); rb.type = "button";
    const myKey = w.id + "|" + me;
    rb.onclick = () => { openRate = openRate === myKey ? null : myKey; render(); };
    acts.append(rb);
    const canManage = isAdmin || w.added_by === me;
    if (canManage) {
      const eb = el("button", "linkish", "Edit bottle"); eb.type = "button";
      eb.onclick = () => startEditWine(w);
      // Quick photo button right on the bottle.
      const inp = el("input"); inp.type = "file"; inp.accept = "image/*"; inp.id = "bp-" + w.id; inp.className = "visually-hidden";
      const pl = el("label", "linkish", w.photo_path ? "📷 Change photo" : "📷 Add a photo"); pl.htmlFor = inp.id; pl.style.cursor = "pointer";
      inp.onchange = async () => {
        const file = inp.files && inp.files[0]; inp.value = ""; if (!file) return;
        flash("Uploading the photo…");
        const res = await setBottlePhoto(w, file);
        if (res) flash(res, true); else { flash(""); await load(); }
      };
      acts.append(eb, pl, inp);
    }
    // Only the person who added a bottle, or an admin, can remove it.
    if (canManage && confirmDel === w.id) {
      const yes = el("button", "btn small ghost", "Yes, remove it and its reviews"); yes.type = "button";
      yes.onclick = () => removeWine(w.id);
      const no = el("button", "linkish", "Keep it"); no.type = "button"; no.onclick = () => { confirmDel = null; render(); };
      acts.append(yes, no);
    } else if (canManage) {
      const d = el("button", "linkish", "Remove bottle"); d.type = "button"; d.onclick = () => { confirmDel = w.id; render(); };
      acts.append(d);
    }
    body.append(acts);
    if (openRate && openRate.startsWith(w.id + "|")) {
      const who = openRate.slice(w.id.length + 1);
      body.append(rateForm(w, s.rs.find(r => r.reviewer === who), who));
    }
    card.append(body);
    list.append(card);
  });
}

function rateForm(w, mine, who) {
  let stars = mine ? mine.stars : 0, buy = mine ? mine.buy : "";
  const f = el("div", "rate");
  f.append(el("div", "label", who === me ? "Your score, " + me : "Editing " + who + "'s review (admin)"));
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

  // Photo: on phones the picker offers the camera or the photo library.
  let newPhoto = null, removePhoto = false;
  const ph = el("div", "photo-pick");
  const prev = el("img", "photo-prev"); prev.alt = "Your photo";
  const input = el("input"); input.type = "file"; input.accept = "image/*"; input.id = "photo-" + w.id; input.className = "visually-hidden";
  const pick = el("label", "btn small ghost", "📷 Add a photo"); pick.htmlFor = input.id;
  const rm = el("button", "linkish", "Remove photo"); rm.type = "button";
  const pst = el("span", "status");
  const showPrev = src => { prev.hidden = !src; if (src) prev.src = src; rm.hidden = !src; pick.textContent = src ? "📷 Change photo" : "📷 Add a photo"; };
  showPrev(mine && mine.photo_path ? photoUrls[mine.photo_path] : null);
  input.onchange = async () => {
    const file = input.files && input.files[0]; if (!file) return;
    pst.className = "status"; pst.textContent = "Getting your photo ready…";
    try { newPhoto = await shrinkPhoto(file); removePhoto = false; showPrev(URL.createObjectURL(newPhoto)); pst.textContent = ""; }
    catch (e) { newPhoto = null; pst.className = "status err"; pst.textContent = "That photo couldn't be opened. Try another one, or take a new one."; }
    input.value = "";
  };
  rm.onclick = () => { newPhoto = null; removePhoto = true; showPrev(null); };
  ph.append(prev, el("div", "actions"));
  ph.lastChild.append(pick, rm, pst);
  ph.append(input);
  f.append(el("div", "label", "Photo of the bottle (optional)"), ph);
  const row = el("div", "actions");
  const save = el("button", "btn small", "Save review"); save.type = "button";
  const st = el("span", "status");
  save.onclick = async () => {
    if (!stars) { st.textContent = "Pick a star score first."; st.className = "status err"; return; }
    if (!buy) { st.textContent = "Say whether you'd buy more."; st.className = "status err"; return; }
    save.disabled = true; st.className = "status"; st.textContent = newPhoto ? "Uploading your photo…" : "Saving…";
    const oldPath = mine && mine.photo_path;
    let photo_path = oldPath || null;
    if (newPhoto) {
      const path = myId + "/" + w.id + "-" + Date.now() + ".jpg";
      const up = await withTimeout(sb.storage.from(BUCKET).upload(path, newPhoto, { contentType: "image/jpeg" }), 60000);
      if (up.error) {
        save.disabled = false; st.className = "status err";
        st.textContent = up.error.message === "timeout" ? "The photo upload timed out. Check your connection and try again." : "Couldn't upload the photo. Try again.";
        return;
      }
      photo_path = path; st.textContent = "Saving…";
    } else if (removePhoto) photo_path = null;
    const row = { wine_id: w.id, reviewer: who, stars, buy, note: ta.value.trim() || null, updated_at: new Date().toISOString() };
    if (newPhoto || removePhoto || oldPath) row.photo_path = photo_path; // only touch photos when there is one
    const { error } = await withTimeout(sb.from("reviews").upsert(row));
    if (error) { save.disabled = false; st.className = "status err"; st.textContent = "Couldn't save just now. Try again."; return; }
    if (oldPath && oldPath !== photo_path) sb.storage.from(BUCKET).remove([oldPath]);
    openRate = null; await load();
  };
  const cancel = el("button", "linkish", "Cancel"); cancel.type = "button"; cancel.onclick = () => { openRate = null; render(); };
  row.append(save, cancel, st); f.append(row);
  return f;
}

async function removeWine(id) {
  const w = wines.find(x => x.id === id);
  const photos = reviews.filter(r => r.wine_id === id && r.photo_path).map(r => r.photo_path);
  if (w && w.photo_path) photos.push(w.photo_path);
  if (photos.length) await sb.storage.from(BUCKET).remove(photos);
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
// Shrink, upload and attach a photo to a bottle. Returns an error message, or null.
async function uploadPhoto(blob, wineId) {
  const path = myId + "/bottle-" + wineId + "-" + Date.now() + ".jpg";
  const up = await withTimeout(sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" }), 60000);
  return up.error ? { error: up.error.message === "timeout" ? "The photo upload timed out. Check your connection and try again." : "Couldn't upload the photo. Try again." } : { path };
}
async function setBottlePhoto(w, file) {
  let blob;
  try { blob = await shrinkPhoto(file); } catch (e) { return "That photo couldn't be opened. Try another one."; }
  const up = await uploadPhoto(blob, w.id);
  if (up.error) return up.error;
  const { data, error } = await withTimeout(sb.from("wines").update({ photo_path: up.path }).eq("id", w.id).select("id"));
  if (error || !data || !data.length) {
    sb.storage.from(BUCKET).remove([up.path]);
    return error ? "Couldn't save the photo on the bottle. Try again." : "Only the person who added this bottle, or an admin, can change its photo.";
  }
  if (w.photo_path) sb.storage.from(BUCKET).remove([w.photo_path]);
  return null;
}

// Photo picker inside the add / edit bottle form.
let formPhoto = null, formPhotoRemoved = false, formOldPhoto = null;
function showFormPhoto(src) {
  $("f-photo-prev").hidden = !src; if (src) $("f-photo-prev").src = src;
  $("f-photo-remove").hidden = !src;
  $("f-photo-pick").textContent = src ? "📷 Change photo" : "📷 Add a photo";
}
$("f-photo").onchange = async () => {
  const file = $("f-photo").files && $("f-photo").files[0]; $("f-photo").value = ""; if (!file) return;
  const st = $("f-photo-status"); st.className = "status"; st.textContent = "Getting your photo ready…";
  try { formPhoto = await shrinkPhoto(file); formPhotoRemoved = false; showFormPhoto(URL.createObjectURL(formPhoto)); st.textContent = ""; }
  catch (e) { formPhoto = null; st.className = "status err"; st.textContent = "That photo couldn't be opened. Try another one."; }
};
$("f-photo-remove").onclick = () => { formPhoto = null; formPhotoRemoved = true; showFormPhoto(null); };

function closeWineForm() {
  formPhoto = null; formPhotoRemoved = false; formOldPhoto = null; showFormPhoto(null); $("f-photo-status").textContent = "";
  editingWine = null; show("add-panel", false); $("add-form").reset(); $("add-status").textContent = "";
  $("add-title").textContent = "Add a bottle"; $("add-btn").textContent = "Add bottle";
}
function startEditWine(w) {
  editingWine = w.id;
  $("f-winery").value = WINERIES.includes(w.winery) ? w.winery : "Somewhere else";
  $("f-name").value = w.name || ""; $("f-vintage").value = w.vintage || "";
  $("f-price").value = w.price != null ? Number(w.price).toFixed(2).replace(/\.00$/, "") : "";
  $("f-bottles").value = w.bottles != null ? w.bottles : "";
  formPhoto = null; formPhotoRemoved = false; formOldPhoto = w.photo_path || null;
  showFormPhoto(formOldPhoto ? photoUrls[formOldPhoto] : null);
  $("add-title").textContent = "Edit bottle"; $("add-btn").textContent = "Save changes";
  $("add-status").textContent = ""; show("add-panel", true);
  $("add-panel").scrollIntoView({ behavior: "smooth", block: "start" }); $("f-name").focus({ preventScroll: true });
}
$("show-add").onclick = () => { closeWineForm(); show("add-panel", true); $("f-winery").focus(); };
$("add-cancel").onclick = closeWineForm;
$("add-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const st = $("add-status"); st.className = "status";
  const vintage = $("f-vintage").value.trim(), price = $("f-price").value.trim().replace(/^\$/, ""), bottles = $("f-bottles").value.trim();
  const bad = t => { st.textContent = t; st.className = "status err"; };
  if (vintage && !/^(19|20)\d\d$/.test(vintage)) return bad("Vintage should be a year like 2021, or blank for NV.");
  if (price && !/^\d+(\.\d{1,2})?$/.test(price)) return bad("Price should be a number like 35 or 42.50.");
  if (bottles && !/^\d{1,3}$/.test(bottles)) return bad("Bottles should be a whole number.");
  const fields = {
    winery: $("f-winery").value, name: $("f-name").value.trim(),
    vintage: vintage || null, price: price ? Number(price) : null, bottles: bottles ? Number(bottles) : null
  };
  $("add-btn").disabled = true;
  const wineId = editingWine || crypto.randomUUID();
  if (formPhoto) {
    st.textContent = "Uploading the photo…";
    const up = await uploadPhoto(formPhoto, wineId);
    if (up.error) { $("add-btn").disabled = false; return bad(up.error); }
    fields.photo_path = up.path;
  } else if (formPhotoRemoved && formOldPhoto) fields.photo_path = null;
  st.textContent = editingWine ? "Saving…" : "Adding…";
  const { data, error } = editingWine
    ? await withTimeout(sb.from("wines").update(fields).eq("id", editingWine).select("id"))
    : await withTimeout(sb.from("wines").insert({ ...fields, id: wineId, added_by: me }));
  $("add-btn").disabled = false;
  if (error) return bad(editingWine ? "Couldn't save the changes. Try again." : "Couldn't add it just now. Try again.");
  if (editingWine && (!data || !data.length)) return bad("Only the person who added this bottle, or an admin, can change it.");
  if (formOldPhoto && "photo_path" in fields) sb.storage.from(BUCKET).remove([formOldPhoto]);
  closeWineForm();
  await load();
});
$("filter").onchange = render; $("sort").onchange = render;

fillSelects();
boot();
