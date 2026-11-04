/* מחברת המתכונים — standalone version (GitHub Pages).
   Everything is stored in this browser (IndexedDB). Reading photos works two ways:
   - built in: OCR inside the browser (Tesseract), free, best on printed text and screenshots;
   - with the user's own free Gemini key: reads handwriting, sorts smartly, searches the web. */
(() => {
"use strict";

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = (p = "r") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const clone = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { if (v === null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } };

let toastT;
function toast(msg, ms = 2800) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
function downloadFile(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- categories (the family book's own, plus a few more) ---------- */
const BASE_CATS = [
  {id:"bread", name:"מאפים ולחמים", short:"מאפים", emoji:"🥐", color:"#ffe6d5"},
  {id:"cakes", name:"עוגות", short:"עוגות", emoji:"🎂", color:"#fde2e7"},
  {id:"cookies", name:"עוגיות", short:"עוגיות", emoji:"🍪", color:"#fff3c4"},
  {id:"desserts", name:"קינוחים", short:"קינוחים", emoji:"🍮", color:"#ebe4fa"},
  {id:"first", name:"מנות ראשונות", short:"ראשונות", emoji:"🥟", color:"#dcf2e3"},
  {id:"salads", name:"סלטים", short:"סלטים", emoji:"🥗", color:"#e4f5d2"},
  {id:"main", name:"מנות עיקריות", short:"עיקריות", emoji:"🍲", color:"#dcedfb"},
  {id:"sides", name:"תוספות", short:"תוספות", emoji:"🍚", color:"#f3ead9"},
  {id:"soups", name:"מרקים", short:"מרקים", emoji:"🍜", color:"#fde8d8"},
  {id:"breakfast", name:"ארוחות בוקר", short:"בוקר", emoji:"🍳", color:"#fff0d9"},
  {id:"sauces", name:"רטבים וממרחים", short:"רטבים", emoji:"🫙", color:"#e9f0dc"},
  {id:"drinks", name:"משקאות", short:"משקאות", emoji:"🥤", color:"#e0f1f5"},
  {id:"other", name:"אחר", short:"אחר", emoji:"📒", color:"#efe6ee"},
];
const OLD_CAT = {starters: "first", mains: "main", baking: "bread"}; // ids used by the first version
const PESACH = {id: "pesach", name: "פסח", emoji: "🍷", color: "#e6f3f7"};
const KASH = {parve: "פרווה", dairy: "חלבי", meat: "בשרי"};
const KASH_EMOJI = {parve: "🌿", dairy: "🥛", meat: "🍗"};
const CAT_COLORS = ["#fde2e7", "#dcf2e3", "#ebe4fa", "#ffe6d5", "#dcedfb", "#fff3c4", "#e4f5d2", "#f3ead9"];
let customCats = [];
const cats = () => [...BASE_CATS.slice(0, -1), ...customCats, BASE_CATS[BASE_CATS.length - 1]];
const catById = id => cats().find(c => c.id === (OLD_CAT[id] || id)) || BASE_CATS[BASE_CATS.length - 1];
function catFromName(name) {
  const n = String(name || "").trim();
  const all = cats();
  return (all.find(c => c.name === n || c.short === n) || all.find(c => n && (c.name.includes(n) || n.includes(c.name))) || all.find(c => c.id === (OLD_CAT[n] || n)) || catById("other")).id;
}
const catNames = () => cats().map(c => c.name).join(", ");

/* keyword sorting, used when there is no Gemini key */
const CAT_WORDS = {
  cakes: ["עוגה","עוגת","עוגות","טארט","רולדה","מאפינס","בראוניז","cake","cheesecake","brownie","muffin"],
  cookies: ["עוגיות","עוגייה","עוגיה","ביסקוטי","מקרונים","מעמולים","cookie","biscotti"],
  desserts: ["קינוח","מוס","פודינג","גלידה","פנקוטה","טירמיסו","סורבה","מלבי","קרם ברולה","פבלובה","dessert","mousse","pudding"],
  bread: ["לחם","חלה","חלות","פיתות","פיתה","בורקס","מאפה","מאפים","בצק עלים","פיצה","פוקאצ'ה","לחמניות","קיש","בייגל","שמרים","רוגלך","bread","pizza","quiche"],
  soups: ["מרק","soup"],
  salads: ["סלט","salad"],
  breakfast: ["שקשוקה","חביתה","פנקייק","פנקייקים","גרנולה","דייסה","טוסט","בלינצ'ס","לביבות","breakfast","pancake","omelet"],
  sauces: ["רוטב","ממרח","מטבל","טחינה","איולי","פסטו","ריבה","חומוס","מיונז","sauce","dip","spread","jam"],
  drinks: ["משקה","שייק","לימונדה","קוקטייל","סמוטי","ליקר","drink","smoothie","shake","lemonade"],
  sides: ["אורז","פתיתים","תפוחי אדמה","תפו\"א","קוסקוס","פירה","קינואה","בורגול","ירקות צלויים","מג'דרה","rice","potato","couscous"],
  main: ["עוף","בשר","בקר","דג ","דגים","סלמון","קציצות","שניצל","תבשיל","צלי","הודו","פרגית","חזה","שוקיים","כרעיים","לזניה","פסטה","ממולאים","חמין","צ'ולנט","מוקפץ","אנטריקוט","chicken","beef","fish","salmon","pasta","stew"],
  first: ["כבד קצוץ","חצילים","פטה","קרפצ'יו","טרטר","סביצ'ה","מנה ראשונה","סיגרים","appetizer","starter"],
};
function guessCat(title, text) {
  const T = (" " + String(title || "") + " ").toLowerCase(), X = (" " + String(text || "") + " ").toLowerCase();
  let best = "other", score = 0;
  for (const [id, words] of Object.entries(CAT_WORDS)) {
    let sc = 0;
    for (const w of words) { if (T.includes(w)) sc += 4; const m = X.split(w).length - 1; sc += Math.min(m, 3); }
    if (sc > score) { score = sc; best = id; }
  }
  return best;
}
function guessKashrut(text) {
  const t = String(text || "");
  if (/(^|\s)(חמאה|שמנת|גבינ\S*|חלב(?!ון)|יוגורט|מוצרלה|פרמזן|לבנה|butter|cream|cheese|milk)/i.test(t)) return "dairy";
  if (/(^|\s)(עוף|בשר|בקר|הודו|פרגית|שוקיים|כרעיים|טחון|נקניק\S*|chicken|beef|meat)/i.test(t)) return "meat";
  return "parve";
}
function guessTags() { return []; }

/* ---------- local storage (IndexedDB, falls back to memory) ---------- */
const Store = {
  db: null, ok: false, mem: {recipes: new Map(), images: new Map(), meta: new Map()},
  async open() {
    try {
      this.db = await Promise.race([
        new Promise((res, rej) => {
          const r = indexedDB.open("recipe-notebook", 1);
          r.onupgradeneeded = () => { const d = r.result;
            d.createObjectStore("recipes", {keyPath: "id"});
            d.createObjectStore("images", {keyPath: "id"});
            d.createObjectStore("meta", {keyPath: "key"}); };
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("blocked"));
        }),
        sleep(5000).then(() => { throw new Error("timeout"); })
      ]);
      this.ok = true;
    } catch { this.ok = false; }
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode); const st = tx.objectStore(store);
      const r = fn(st); tx.oncomplete = () => res(r && "result" in r ? r.result : undefined);
      tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  async all(store) {
    if (!this.ok) return [...this.mem[store].values()];
    try { return await this.req(store, "readonly", s => s.getAll()); } catch { return [...this.mem[store].values()]; }
  },
  async get(store, id) {
    if (!this.ok) return this.mem[store].get(id);
    try { return await this.req(store, "readonly", s => s.get(id)); } catch { return this.mem[store].get(id); }
  },
  async put(store, obj) {
    const key = store === "meta" ? obj.key : obj.id;
    this.mem[store].set(key, obj);
    if (!this.ok) return;
    try { await this.req(store, "readwrite", s => s.put(obj)); } catch (e) { if (String(e && e.name) === "QuotaExceededError") toast("אין מספיק מקום בדפדפן לשמירה"); }
  },
  async del(store, id) {
    this.mem[store].delete(id);
    if (!this.ok) return;
    try { await this.req(store, "readwrite", s => s.delete(id)); } catch {}
  },
};
const meta = {
  async get(k, d) { const r = await Store.get("meta", k); return r ? r.value : d; },
  async set(k, v) { await Store.put("meta", {key: k, value: v}); },
};
let persistAsked = false;
function askPersist() { if (persistAsked) return; persistAsked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {} }

/* ---------- images ---------- */
const imgCache = new Map();
const isPath = id => typeof id === "string" && /^(img\/|https?:|data:|blob:)/.test(id);
async function getImg(id) {
  if (!id) return null;
  if (isPath(id)) return id;
  if (imgCache.has(id)) return imgCache.get(id);
  const r = await Store.get("images", id);
  if (r) imgCache.set(id, r.data);
  return r ? r.data : null;
}
async function putImg(data, id = rid("i")) { imgCache.set(id, data); await Store.put("images", {id, data}); return id; }
async function delImg(id) { if (!id || isPath(id)) return; imgCache.delete(id); await Store.del("images", id); }

async function decode(file) {
  try { if (window.createImageBitmap) return await createImageBitmap(file, {imageOrientation: "from-image"}); } catch {}
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
    im.src = url;
  });
}
function drawTo(src, maxDim, filter) {
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const k = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  if (filter) g.filter = filter;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const toBlob = (c, q) => new Promise(r => c.toBlob(b => r(b), "image/jpeg", q));
const blobToURL = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
async function fileToBlob(file, maxDim, q = .85, filter) { const bmp = await decode(file); return toBlob(drawTo(bmp, maxDim, filter), q); }
/* A compact JPEG data URL, small enough to keep many in the browser and to share by file. */
async function compactURL(fileOrBlob, maxDim = 1100) {
  const bmp = await decode(fileOrBlob);
  let dim = maxDim, q = .8, url = "";
  for (let i = 0; i < 6; i++) {
    url = drawTo(bmp, dim).toDataURL("image/jpeg", q);
    if (url.length < 300000) break;
    dim = Math.round(dim * .82); q = Math.max(.55, q - .06);
  }
  return url;
}

/* ---------- the dish photo inside a scanned image ---------- */
/* Crop a box given as [ymin, xmin, ymax, xmax] on a 0-1000 scale. Returns a data URL, or null if the box is too small. */
async function cropPhoto(file, box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  let [y0, x0, y1, x1] = box.map(v => Math.max(0, Math.min(1000, Number(v) || 0)));
  if (y1 < y0) [y0, y1] = [y1, y0]; if (x1 < x0) [x0, x1] = [x1, x0];
  if ((y1 - y0) * (x1 - x0) < 40000 || y1 - y0 < 120 || x1 - x0 < 120) return null; // under 4% of the image
  const bmp = await decode(file);
  const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
  const sx = x0 / 1000 * W, sy = y0 / 1000 * H, sw = (x1 - x0) / 1000 * W, sh = (y1 - y0) / 1000 * H;
  if (sw < 140 || sh < 140) return null;
  const k = Math.min(1, 1100 / Math.max(sw, sh));
  const c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", .82);
}
/* Without Gemini: find the largest text-free, colourful, busy rectangle (a photo, not paper or a plain background). */
async function findPhotoBox(file, ocr) {
  const bmp = await decode(file);
  const c = drawTo(bmp, 120); const cw = c.width, ch = c.height;
  const px = c.getContext("2d").getImageData(0, 0, cw, ch).data;
  const lum = new Float32Array(cw * ch), sat = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum[i] = .299 * r + .587 * g + .114 * b; sat[i] = mx ? (mx - mn) / mx : 0;
  }
  const text = new Uint8Array(cw * ch);
  for (const bb of ocr.lines || []) {
    const gx0 = Math.floor(bb.x0 / ocr.w * cw) - 1, gx1 = Math.ceil(bb.x1 / ocr.w * cw) + 1;
    const gy0 = Math.floor(bb.y0 / ocr.h * ch) - 1, gy1 = Math.ceil(bb.y1 / ocr.h * ch) + 1;
    for (let y = Math.max(0, gy0); y < Math.min(ch, gy1); y++) for (let x = Math.max(0, gx0); x < Math.min(cw, gx1); x++) text[y * cw + x] = 1;
  }
  const photo = new Uint8Array(cw * ch);
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = y * cw + x; if (text[i]) continue;
    let m = 0, m2 = 0, s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = lum[i + dy * cw + dx]; m += v; m2 += v * v; s += sat[i + dy * cw + dx]; }
    m /= 9; const sd = Math.sqrt(Math.max(0, m2 / 9 - m * m)); s /= 9;
    photo[i] = (sd > 14 && s > .12) || s > .32 ? 1 : 0;
  }
  // largest all-photo rectangle (histogram method), allowing the odd gap by smoothing rows first
  const hgt = new Int32Array(cw); let best = {a: 0};
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) { const i = y * cw + x; const near = photo[i] || (x > 0 && x < cw - 1 && photo[i - 1] && photo[i + 1] && !text[i]); hgt[x] = near ? hgt[x] + 1 : 0; }
    const st = [];
    for (let x = 0; x <= cw; x++) {
      const hh = x < cw ? hgt[x] : 0; let start = x;
      while (st.length && st[st.length - 1][1] >= hh) { const [sx, sh] = st.pop(); const a = sh * (x - sx); if (a > best.a) best = {a, x0: sx, x1: x, y0: y - sh + 1, y1: y + 1}; start = sx; }
      st.push([start, hh]);
    }
  }
  if (!best.a) return null;
  const bw = best.x1 - best.x0, bh = best.y1 - best.y0;
  if (best.a < .12 * cw * ch || bw < .3 * cw || bh < .18 * ch || bw / bh > 4 || bh / bw > 4) return null;
  // the region must really be colourful (food), not grey paper texture or a dark table
  let cs = 0; for (let y = best.y0; y < best.y1; y++) for (let x = best.x0; x < best.x1; x++) cs += sat[y * cw + x];
  if (cs / best.a < .2) return null;
  return [best.y0 / ch * 1000, best.x0 / cw * 1000, best.y1 / ch * 1000, best.x1 / cw * 1000].map(Math.round);
}

/* ---------- Gemini (the user's own free key) ---------- */
const Gemini = {
  key: ls.get("rn-gemini-key", ""),
  model: ls.get("rn-gemini-model", ""),
  MODELS: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"],
  last: 0,
  get on() { return !!this.key; },
  setKey(k) { this.key = (k || "").trim(); ls.set("rn-gemini-key", this.key); },
  async throttle() { const gap = 4200 - (now() - this.last); if (gap > 0) await sleep(gap); this.last = now(); },
  async call(parts, {json = true, search = false, signal} = {}) {
    if (!this.key) throw {code: "no_key"};
    const models = this.model ? [this.model, ...this.MODELS.filter(m => m !== this.model)] : this.MODELS;
    let lastErr = null;
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal && signal.aborted) throw {code: "cancelled"};
        await this.throttle();
        const body = {contents: [{role: "user", parts}], generationConfig: {temperature: search ? .4 : .15}};
        if (json && !search) body.generationConfig.responseMimeType = "application/json";
        if (search) body.tools = [{google_search: {}}];
        let res;
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST", signal, headers: {"Content-Type": "application/json", "x-goog-api-key": this.key}, body: JSON.stringify(body)});
        } catch (e) {
          if (e && e.name === "AbortError") throw {code: "cancelled"};
          lastErr = {code: "network"}; await sleep(1500); continue;
        }
        let data = null; try { data = await res.json(); } catch {}
        if (res.ok) {
          if (this.model !== model) { this.model = model; ls.set("rn-gemini-model", model); }
          const cand = data && data.candidates && data.candidates[0];
          const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map(p => p.text || "").join("") : "";
          if (!text) { lastErr = {code: "empty"}; break; }
          const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks || []).map(c => c.web).filter(Boolean);
          return {text, sources: chunks};
        }
        const msg = String(data && data.error && data.error.message || "");
        const status = String(data && data.error && data.error.status || "");
        if (res.status === 400 && /api key/i.test(msg)) throw {code: "bad_key"};
        if (res.status === 403) throw {code: "bad_key"};
        if (res.status === 404 || (res.status === 400 && /model/i.test(msg) && /not found|not supported/i.test(msg))) { lastErr = {code: "no_model"}; break; }
        if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
          const m = JSON.stringify(data || {}).match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
          const wait = m ? Math.ceil(parseFloat(m[1])) : 20;
          if (attempt < 2 && wait <= 65 && !/per ?day|daily/i.test(msg)) { Gemini.onWait && Gemini.onWait(wait); await sleep(wait * 1000); continue; }
          throw {code: "rate_limited"};
        }
        if (res.status >= 500) { lastErr = {code: "unavailable"}; await sleep(2500); continue; }
        throw {code: "error", message: msg};
      }
    }
    throw lastErr || {code: "error"};
  },
  parseJSON(text) {
    const t = String(text || "").trim();
    const tries = [t];
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) tries.push(fence[1]);
    const a = Math.min(...["{", "["].map(c => t.indexOf(c)).filter(i => i >= 0)), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (isFinite(a) && b > a) tries.push(t.slice(a, b + 1));
    for (const x of tries) { try { return JSON.parse(x); } catch {} }
    throw {code: "invalid_json"};
  },
  async json(prompt, {images, signal, search} = {}) {
    const parts = [{text: prompt}];
    for (const b of images || []) { const url = await blobToURL(b); parts.push({inline_data: {mime_type: "image/jpeg", data: url.slice(url.indexOf(",") + 1)}}); }
    const {text, sources} = await this.call(parts, {json: true, search, signal});
    const value = this.parseJSON(text);
    return search ? {value, sources} : value;
  },
};
function aiErr(e) {
  const c = e && e.code;
  if (c === "bad_key") return "מפתח Gemini לא תקין. בדקו אותו בתפריט ← מנוע הסריקה.";
  if (c === "rate_limited") return "נגמרה המכסה החינמית של Gemini לעכשיו. נסו שוב מאוחר יותר (המכסה היומית מתאפסת כל יום).";
  if (c === "invalid_json" || c === "empty") return "התשובה לא הובנה. נסו שוב.";
  if (c === "network") return "אין חיבור לאינטרנט.";
  if (c === "no_model") return "Gemini לא זמין כרגע לחשבון הזה.";
  if (c === "cancelled") return "בוטל.";
  if (c === "ocr_load") return "לא הצלחתי להוריד את מנוע הזיהוי. צריך חיבור לאינטרנט בפעם הראשונה.";
  return "משהו השתבש. נסו שוב.";
}
const RECIPE_SHAPE = () => `{"title": string, "category": one of [${catNames()}], "servings": string or "", "time": string or "", "ingredients": [strings, one ingredient per line with its quantity as written; a sub-heading such as "לבצק" as "## לבצק"], "steps": [strings, one step each, no numbering; a sub-heading as "## ..."], "notes": string (tips, the writer's remarks, variations; "" if none), "kashrut": "parve" | "dairy" | "meat" (dairy if any milk product, meat if any meat or poultry, otherwise parve), "pesach": true if it suits Passover as written (no flour, bread, pasta or leavening), else false, "intro": one short sentence about the dish if the source gives one, else "", "temp": the oven temperature if given, else "", "tags": [up to 3 short Hebrew tags such as "טבעוני","ללא גלוטן","חגים","מהיר"]}`;

/* ---------- built-in reader: OCR in the browser ---------- */
const Local = {
  worker: null, loading: null, onStatus: null,
  loadLib() {
    if (window.Tesseract) return Promise.resolve();
    return this.loading || (this.loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = res; s.onerror = () => { this.loading = null; rej({code: "ocr_load"}); };
      document.head.append(s);
    }));
  },
  async getWorker() {
    if (this.worker) return this.worker;
    await this.loadLib();
    this.onStatus && this.onStatus("מוריד את מנוע הזיהוי לעברית (פעם אחת, כמה שניות)…");
    try {
      this.worker = await Tesseract.createWorker(["heb", "eng"], 1, {logger: () => {}});
    } catch { throw {code: "ocr_load"}; }
    this.onStatus && this.onStatus("");
    return this.worker;
  },
  async ocr(file) {
    const w = await this.getWorker();
    const bmp = await decode(file);
    const c = drawTo(bmp, 2200, "grayscale(1) contrast(1.25)");
    const {data} = await w.recognize(await toBlob(c, .92));
    // Keep only lines that read as real words: a photo often yields "text" that is mostly symbols, at low confidence.
    // The page text (data.text) is in reading order; the per-line list carries positions and confidence.
    // Both list the same lines in the same order, so they are paired up when the counts match.
    const strip = t => fixOrder(String(t || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim());
    const all = [];
    for (const b of (data && data.blocks) || []) for (const pg of b.paragraphs || []) for (const l of pg.lines || []) if (strip(l.text)) all.push(l);
    const read = String(data && data.text || "").split("\n").map(strip).filter(Boolean);
    const paired = read.length === all.length;
    const lines = [], texts = [];
    const good = (t, conf) => {
      const letters = (t.match(/\p{L}/gu) || []).length, heb = (t.match(/[\u05D0-\u05EA]/g) || []).length;
      const ratio = letters / Math.max(1, t.replace(/\s/g, "").length);
      return letters >= 2 && ratio >= .6 && (conf >= 60 || (conf >= 40 && heb >= 3));
    };
    if (paired) all.forEach((l, i) => { if (good(read[i], l.confidence == null ? 100 : l.confidence)) { texts.push(read[i]); if (l.bbox) lines.push(l.bbox); } });
    else {
      read.forEach(t => { if (good(t, 100)) texts.push(t); });
      all.forEach(l => { if (good(strip(l.text), l.confidence == null ? 100 : l.confidence) && l.bbox) lines.push(l.bbox); });
    }
    return {text: texts.join("\n"), lines, w: c.width, h: c.height};
  },
  async stop() { if (this.worker) { try { await this.worker.terminate(); } catch {} this.worker = null; } },
};

/* Hebrew OCR sometimes returns a line in visual order: "כוסות קמח 2", ".מחממים תנור .1". Put numbers and periods back. */
function fixOrder(t) {
  const heb = (t.match(/[\u05D0-\u05EA]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length;
  if (heb < 3 || heb < lat) return t;
  let m;
  if ((m = t.match(/^\.?\s*(.*?)\s*\.\s*(\d{1,2})$/)) && /[\u05D0-\u05EA]/.test(m[1])) return `${m[2]}. ${m[1].replace(/\.$/, "")}.`; // ".step .1" -> "1. step."
  if (/^\.\S/.test(t)) t = t.slice(1) + ".";                                                     // ".text" -> "text."
  if ((m = t.match(/^(\D*[\u05D0-\u05EA]\D*?)\s*(\d+(?:[.,/]\d+)?|½|¼|¾|⅓|⅔)$/)) && m[1].trim().split(/\s+/).length <= 4 && !VERB_RE.test(m[1])) return `${m[2]} ${m[1].trim()}`; // "קמח 2" -> "2 קמח"
  return t;
}
const UNIT_RE = /(^|\s)(\d+([.,/]\d+)?|½|¼|¾|⅓|⅔|חצי|רבע|שליש|כוס|כוסות|כף|כפות|כפית|כפיות|גרם|גר'|ג'|ק"ג|קילו|מ"ל|ליטר|יח'|יחידות|חבילה|חבילות|שקית|שקיות|קופסה|קופסת|פחית|צרור|שן|שיני|קורט|מעט|לפי הטעם|חופן|cups?|tbsp|tsp|grams?|g|ml|oz|lb)(?=\s|$|[.,)])/i;
const VERB_RE = /(מערבבים|מוסיפים|אופים|מחממים|מבשלים|מטגנים|שמים|יוצקים|מקציפים|לשים|קוצצים|חותכים|מגישים|מניחים|טורפים|מרתיחים|מסננים|משרים|מפזרים|מכניסים|מוציאים|מקררים|משמנים|מרפדים|מגלגלים|ממלאים|מקפלים|לערבב|להוסיף|לאפות|לבשל|לטגן|לחמם|לקצוץ|להגיש|לטרוף|mix|add|bake|cook|stir|heat|serve|place|pour|whisk|preheat)/i;
const ING_W = ["מצרכים","המצרכים","רכיבים","הרכיבים","מרכיבים","המרכיבים","מה צריך","חומרים","ingredients"];
const STEP_W = ["אופן ההכנה","אופן הכנה","ההכנה","הכנה","הוראות הכנה","הוראות","דרך ההכנה","שלבי הכנה","שלבי ההכנה","preparation","instructions","method","directions"];
const NOTE_W = ["הערות","הערה","טיפ","טיפים","notes","note","tips","tip"];
const headOf = l => { const t = l.replace(/[:：\-–*#•]/g, " ").replace(/\s+/g, " ").trim().toLowerCase(); if (t.length > 28) return null;
  const hit = ws => ws.some(w => t === w || t.startsWith(w + " "));
  if (hit(ING_W)) return "ing"; if (hit(STEP_W)) return "st"; if (hit(NOTE_W)) return "notes";
  // a short line holding a heading word, even if the word before it was misread ("אופן ההכנה" read as "DIX ההכנה")
  if (t.length <= 20 && !/\d/.test(t)) { const w = t.split(" "); if (w.includes("ההכנה") || w.includes("הכנה")) return "st"; if (w.includes("מצרכים") || w.includes("המצרכים") || w.includes("רכיבים")) return "ing"; }
  return null; };
const letterRatio = l => (l.match(/[\p{L}\p{N}½¼¾⅓⅔]/gu) || []).length / Math.max(1, l.replace(/\s/g, "").length);
const ingLike = l => l.length < 70 && (UNIT_RE.test(l) || /^[•\-*·◦▪]\s*/.test(l)) && !VERB_RE.test(l);
const cleanLine = l => l.replace(/[|_~^`]+/g, " ").replace(/\s+/g, " ").trim();

function recipeScore(text) {
  const lines = String(text).split("\n").map(cleanLine).filter(l => l.length > 2);
  let heads = 0, units = 0, verbs = 0;
  for (const l of lines) { if (headOf(l)) heads++; else { if (ingLike(l)) units++; if (VERB_RE.test(l)) verbs++; } }
  const ok = (heads >= 1 && units + verbs >= 2) || (units >= 3 && verbs >= 1) || units >= 5 || verbs >= 4;
  return {ok, heads, units, verbs};
}
function parseRecipeText(raw, hintTitle) {
  const lines = String(raw).replace(/\r/g, "").split("\n").map(cleanLine).filter(l => l.length > 1 && letterRatio(l) >= .5);
  let sec = "pre"; const pre = [], ing = [], st = [], notes = [];
  for (const l of lines) {
    const h = headOf(l); if (h) { sec = h; continue; }
    ({pre, ing, st, notes})[sec].push(l);
  }
  let title = "";
  const tIdx = pre.findIndex(l => l.length < 48 && !ingLike(l) && !VERB_RE.test(l));
  if (tIdx >= 0) { title = pre[tIdx]; pre.splice(tIdx, 1); }
  if (!ing.length && !st.length) { for (const l of pre) (ingLike(l) ? ing : st).push(l); }
  else for (const l of pre) (ingLike(l) ? ing : notes).push(l);
  const ingredients = ing.map(l => {
    const t = l.replace(/^[•\-*·◦▪]\s*/, "");
    return (/[:：]$/.test(t) && t.length < 30 && !UNIT_RE.test(t)) ? "## " + t.replace(/[:：]$/, "") : t;
  });
  const steps = [];
  const num = /^(\d{1,2})\s*[.)\-]\s*/;
  for (const l0 of st) {
    const l = l0.replace(/^[•\-*·◦▪]\s*/, "");
    if (!steps.length || num.test(l) || /^[•\-*·◦▪]/.test(l0) || /[.!?:]$/.test(steps[steps.length - 1])) steps.push(l.replace(num, ""));
    else steps[steps.length - 1] += " " + l;
  }
  let finalSteps = steps;
  if (steps.length === 1 && steps[0].length > 160) finalSteps = steps[0].split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!title) title = String(hintTitle || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (!title || /^(img|dsc|pxl|screenshot|צילום מסך)/i.test(title) || /^\d[\d\s]+$/.test(title)) title = "מתכון מסריקה";
  return {title, ingredients, steps: finalSteps, notes: notes.join("\n"), category: guessCat(title, raw), k: guessKashrut(raw), tags: guessTags(raw)};
}

function normRecipe(o, extra = {}) {
  const arr = v => Array.isArray(v) ? v.map(x => String(x ?? "").trim()).filter(Boolean) : String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
  const cid = OLD_CAT[o.category] || o.category;
  const category = cats().some(c => c.id === cid) ? cid : catFromName(o.category);
  let k = String(o.k || o.kashrut || "").trim();
  k = {"פרווה": "parve", "חלבי": "dairy", "בשרי": "meat"}[k] || (KASH[k] ? k : "");
  return Object.assign({
    id: rid(), title: String(o.title || "מתכון ללא שם").trim(), category, k, pesach: !!o.pesach,
    intro: String(o.intro || "").trim(), byline: String(o.byline || "").trim(), credit: String(o.credit || "").trim(),
    temp: String(o.temp || "").trim(), servings: String(o.servings || "").trim(), time: String(o.time || "").trim(),
    ingredients: arr(o.ingredients), steps: arr(o.steps), notes: String(o.notes || "").trim(), alerts: arr(o.alerts),
    tags: arr(o.tags).slice(0, 6), photo: null, photos: [], thumb: "", sourceImgs: [], video: "", videos: [], source: {type: "manual"},
    fav: false, fresh: false, createdAt: now(), updatedAt: now(),
  }, extra);
}

/* ---------- app state ---------- */
const S = {recipes: [], cat: "all", k: "", fav: false, q: "", sort: "new"};

async function saveRecipe(r, {quiet} = {}) {
  r.updatedAt = now();
  const i = S.recipes.findIndex(x => x.id === r.id);
  if (i >= 0) S.recipes[i] = r; else S.recipes.push(r);
  await Store.put("recipes", clone(r));
  if (!r.builtin) askPersist();
  if (!quiet) render();
}
async function deleteRecipe(id) {
  const r = S.recipes.find(x => x.id === id); if (!r) return;
  S.recipes = S.recipes.filter(x => x.id !== id);
  await Store.del("recipes", id);
  if (r.builtin) { const d = await meta.get("deletedBuiltins", []); if (!d.includes(id)) { d.push(id); await meta.set("deletedBuiltins", d); } }
  for (const im of [r.photo, ...(r.photos || []), ...(r.sourceImgs || [])].filter(Boolean)) {
    if (!S.recipes.some(o => o.photo === im || (o.photos || []).includes(im) || (o.sourceImgs || []).includes(im))) await delImg(im);
  }
  render();
}

/* ---------- the family's recipes, built in for everyone ---------- */
async function loadBuiltins() {
  let data;
  try { const res = await fetch("builtin.json", {cache: "no-cache"}); if (!res.ok) return false; data = await res.json(); } catch { return false; }
  const ver = data.version || 1;
  const seen = await meta.get("builtinVer", 0);
  if (seen >= ver) return false;
  if (seen) { // already added on an earlier visit: refresh only the video links, keep everything the person changed
    const byId = new Map((data.recipes || []).map(o => [o.id, o]));
    for (const r of S.recipes) {
      const o = r.builtin && byId.get(r.id);
      if (o && (o.video !== r.video || JSON.stringify(o.videos || []) !== JSON.stringify(r.videos || []))) { r.video = o.video || ""; r.videos = o.videos || []; await Store.put("recipes", clone(r)); }
    }
  }
  const deleted = new Set(await meta.get("deletedBuiltins", []));
  const have = new Set(S.recipes.map(r => r.id));
  for (const o of data.recipes || []) {
    if (have.has(o.id) || deleted.has(o.id)) continue;
    const r = normRecipe(o, {id: o.id, builtin: true, photo: o.photo || null, photos: o.photos || [], thumb: o.thumb || "",
      sourceImgs: o.sourceImgs || [], video: o.video || "", videos: o.videos || (o.video ? [o.video] : []), source: o.source || {type: "family"}, createdAt: o.order || 0, updatedAt: 0});
    S.recipes.push(r); await Store.put("recipes", clone(r));
  }
  for (const r of S.recipes.filter(r => r.sample)) await Store.del("recipes", r.id); // the old example recipes
  S.recipes = S.recipes.filter(r => !r.sample);
  await meta.set("builtinVer", ver);
  return true;
}

/* ---------- rendering: home page ---------- */
const cleanQ = s => String(s || "").toLowerCase().replace(/[֑-ׇ]/g, "").trim();
function visible() {
  let list = S.recipes.filter(r => (S.cat === "all" || (S.cat === "pesach" ? r.pesach : r.category === S.cat)) && (!S.k || r.k === S.k) && (!S.fav || r.fav));
  if (S.q) {
    const words = cleanQ(S.q).split(/\s+/).filter(Boolean);
    list = list.filter(r => {
      const hay = cleanQ([r.title, catById(r.category).name, r.intro, r.credit, r.byline, KASH[r.k], ...(r.tags || []), ...(r.ingredients || []), r.notes].join(" "));
      return words.every(w => hay.includes(w));
    });
  }
  list.sort(S.sort === "az" ? (a, b) => a.title.localeCompare(b.title, "he") : (a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}
function imgAttr(id) { return isPath(id) ? `src="${esc(id)}"` : `data-img="${esc(id)}"`; }
function cardHTML(r) {
  const c = catById(r.category);
  const img = r.thumb || r.photo || (r.photos || [])[0] || (r.sourceImgs || [])[0];
  const scan = !r.photo && !(r.photos || []).length && !!img;
  return `<li><button class="card" type="button" data-open="${esc(r.id)}">
    <div class="ph${scan ? " scanph" : ""}" style="--c:${c.color}">${img ? `<img alt="" loading="lazy" decoding="async" ${imgAttr(img)}>` : esc(c.emoji)}${r.fresh ? `<span class="flag new">חדש · לבדיקה</span>` : ""}${r.fav ? `<span class="star" aria-label="מועדף">★</span>` : ""}</div>
    <div class="body"><h3>${esc(r.title)}</h3><div class="badges">${r.k ? `<span class="badge k-${r.k}">${KASH[r.k]}</span>` : ""}<span class="badge">${esc(c.short || c.name)}</span>${r.video ? `<span class="badge" title="יש סרטון">🎬</span>` : ""}</div></div>
  </button></li>`;
}
function renderChips() {
  const favN = S.recipes.filter(r => r.fav).length, pesN = S.recipes.filter(r => r.pesach).length;
  let h = `<button class="chip" type="button" data-k="" aria-pressed="${!S.k && !S.fav}">הכל</button>`;
  for (const k of ["parve", "dairy", "meat"]) h += `<button class="chip ${k}" type="button" data-k="${k}" aria-pressed="${S.k === k}">${KASH_EMOJI[k]} ${KASH[k]}</button>`;
  if (pesN) h += `<button class="chip pes" type="button" data-c="pesach" aria-pressed="${S.cat === "pesach"}">🍷 פסח</button>`;
  if (favN) h += `<button class="chip fav" type="button" data-fav="1" aria-pressed="${S.fav}">⭐ מועדפים</button>`;
  $("#chips").innerHTML = h;
}
function renderTiles() {
  const counts = {}; for (const r of S.recipes) counts[r.category] = (counts[r.category] || 0) + 1;
  const pesN = S.recipes.filter(r => r.pesach).length;
  const tile = (c, n) => `<button class="tile" type="button" style="--c:${c.color}" data-cat="${esc(c.id)}" aria-pressed="${S.cat === c.id}"><span class="em" aria-hidden="true">${esc(c.emoji)}</span><b>${esc(c.name)}</b><small>${n} מתכונים</small></button>`;
  let h = cats().filter(c => counts[c.id] || customCats.includes(c)).map(c => tile(c, counts[c.id] || 0)).join("");
  if (pesN) h += tile(PESACH, pesN);
  $("#tiles").innerHTML = h;
}
function renderNotices() {
  $("#notices").innerHTML = Store.ok ? "" : `<div class="notice"><p>הדפדפן הזה לא מאפשר שמירה קבועה (אולי חלון גלישה פרטית). מה שתוסיפו יישמר רק עד שתסגרו את הדף – שמרו גיבוי מהתפריט.</p></div>`;
}
function render() {
  renderChips(); renderTiles(); renderNotices();
  $("#heroCount").textContent = S.recipes.length;
  const list = visible();
  let title = S.q ? `תוצאות עבור "${S.q}"` : S.cat === "pesach" ? "פסח" : S.cat !== "all" ? catById(S.cat).name : S.fav ? "מועדפים" : "כל המתכונים";
  if (S.k) title += ` · ${KASH[S.k]}`;
  $("#listTitle").textContent = title;
  $("#count").textContent = `${list.length} מתכונים`;
  $("#clear").hidden = !(S.cat !== "all" || S.k || S.fav || S.q);
  $("#shareCat").hidden = !(S.cat !== "all" && list.length);
  $("#grid").innerHTML = list.map(cardHTML).join("");
  $("#empty").hidden = list.length > 0;
  fillImgs($("#grid"));
}
function fillImgs(root) {
  $$("img[data-img]", root).forEach(async im => { const d = await getImg(im.dataset.img); if (d) im.src = d; else im.remove(); });
}

/* ---------- layers ---------- */
let layerOnClose = null;
function openLayer(html, {narrow, onClose, page} = {}) {
  const L = $("#layer");
  L.classList.toggle("page", !!page);
  L.innerHTML = `<div class="dlg${narrow ? " narrow" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  L.hidden = false; document.body.style.overflow = "hidden";
  layerOnClose = onClose || null;
  L.scrollTop = 0;
  const f = $("[autofocus]", L); if (f) f.focus();
  return $(".dlg", L);
}
function closeLayer() {
  const L = $("#layer"); if (L.hidden) return;
  if (layerOnClose) { try { layerOnClose(); } catch {} layerOnClose = null; }
  L.hidden = true; L.innerHTML = ""; L.classList.remove("page"); document.body.style.overflow = "";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}
$("#layer").addEventListener("mousedown", e => { if (e.target.id === "layer") closeLayer(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLayer(); });
const head = t => `<div class="panel-h"><h2>${t}</h2><button class="btn icon-btn ghost close" type="button" data-act="close" aria-label="סגירה">✕</button></div>`;
const dots = txt => `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span> ${txt}</div>`;

/* ---------- recipe page ---------- */
const isGroup = (l, kind) => /^#{1,3}\s*/.test(l) || (kind === "ing" && /[:：]$/.test(l) && l.length < 40);
const groupName = l => l.replace(/^#{1,3}\s*/, "").replace(/[:：]$/, "");
function ingHTML(lines) {
  let out = "", cur = [];
  const flush = () => { if (cur.length) out += `<ul class="ing">${cur.map(x => `<li><label><input type="checkbox"><span>${esc(x)}</span></label></li>`).join("")}</ul>`; cur = []; };
  for (const l of lines) { if (isGroup(l, "ing")) { flush(); out += `<h3>${esc(groupName(l))}</h3>`; } else cur.push(l); }
  flush(); return out;
}
function stepsHTML(lines) {
  let out = "", cur = [];
  const flush = () => { if (cur.length) out += `<ol class="steps${cur.length === 1 && /^אין /.test(cur[0]) ? " plain" : ""}">${cur.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`; cur = []; };
  for (const l of lines) { if (isGroup(l, "st")) { flush(); out += `<h3>${esc(groupName(l))}</h3>`; } else cur.push(l); }
  flush(); return out;
}
function sourceHTML(r) {
  const s = r.source || {};
  const link = s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(hostOf(s.url) || "קישור")}</a>` : "";
  if (s.type === "family") return s.label || s.url ? `📌 מקור: ${esc(s.label)}${link}` : "";
  if (s.type === "image") return `📌 מקור: צילום${s.label ? ` "${esc(s.label)}"` : ""}`;
  if (s.type === "web") return `📌 מקור: ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || hostOf(s.url))}</a>` : esc(s.label || "אתר")}${s.alt ? ` · <a href="${esc(s.alt)}" target="_blank" rel="noopener">חיפוש באתר</a>` : ""}`;
  if (s.type === "claude" || s.type === "ai") return `📌 מקור: הצעה של ${s.type === "claude" ? "Claude" : "Gemini"} מתוך ידע כללי`;
  if (s.type === "shared") return `📌 מקור: שותף איתכם${s.label ? ` · ${esc(s.label)}` : ""}`;
  if (s.type === "text") return "📌 מקור: טקסט שהודבק";
  return "📌 נכתב ידנית";
}
const photosOf = r => [...new Set([r.photo, ...(r.photos || [])].filter(Boolean))];
function openRecipe(id) {
  const r = S.recipes.find(x => x.id === id); if (!r) return;
  const c = catById(r.category);
  const photos = photosOf(r);
  const vids = [...new Set([...(r.videos || []), r.video].filter(Boolean))].filter(v => /^(vid\/|https:)/.test(v));
  const meta = [r.temp && `🔥 ${r.temp}`, r.time && `⏱️ ${r.time}`, r.servings && `🍽️ ${r.servings}`].filter(Boolean);
  const notes = String(r.notes || "").split("\n").map(x => x.trim()).filter(Boolean);
  const more = S.recipes.filter(o => o.id !== r.id && o.category === r.category).slice(0, 4);
  const src = sourceHTML(r);
  const p = openLayer(`
    <div class="topbar"><div class="wrap"><button class="back" type="button" data-act="close">→ לכל המתכונים</button>
      <span class="tbtns"><button class="iconbtn" type="button" data-act="fav" aria-label="${r.fav ? "מועדף" : "הוספה למועדפים"}">${r.fav ? "⭐" : "☆"}<span class="tl"> ${r.fav ? "מועדף" : "למועדפים"}</span></button><button class="iconbtn" type="button" data-act="share" aria-label="שיתוף">📤<span class="tl"> שיתוף</span></button><button class="iconbtn" type="button" data-act="edit" aria-label="עריכה">✏️<span class="tl"> עריכה</span></button></span></div></div>
    <div class="wrap rpage"><article>
      <div class="gal" style="--c:${c.color}">${photos.length ? `<div class="track">${photos.map(ph => `<figure><img alt="${esc(r.title)}" ${imgAttr(ph)}></figure>`).join("")}</div>${photos.length > 1 ? `<span class="count">${photos.length} תמונות · החליקו</span>` : ""}${r.autoPhoto ? `<span class="auto">נלקחה מהתמונה שנסרקה</span>` : ""}` : `<div class="phx" aria-hidden="true">${esc(c.emoji)}</div>`}</div>
      <div class="photobtns noprint"><button class="btn sm" type="button" data-act="photo">📷 ${photos.length ? "החלפת התמונה" : "הוספת תמונה של המנה"}</button>${photos.length ? `<button class="btn sm ghost" type="button" data-act="nophoto">הסרת התמונה</button>` : ""}</div>
      <h1 class="rt">${esc(r.title)}</h1>
      ${r.intro ? `<p class="intro">${esc(r.intro)}</p>` : ""}
      ${r.byline ? `<p class="byline">${esc(r.byline)}</p>` : ""}
      <div class="badges">
        <label class="badge catsel" style="background:${c.color}">${esc(c.emoji)} ${esc(c.name)} ▾<select data-act="setcat" aria-label="שינוי קטגוריה">${cats().map(x => `<option value="${esc(x.id)}"${x.id === r.category ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        ${r.k ? `<span class="badge k-${r.k}">${KASH[r.k]}</span>` : ""}${r.pesach ? `<span class="badge b-pesach">🍷 כשר לפסח</span>` : ""}
        ${(r.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join("")}
      </div>
      ${meta.length ? `<ul class="meta">${meta.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${(r.alerts || []).map(a => `<p class="knote">${esc(a)}</p>`).join("")}
      ${r.fresh ? `<div class="fresh noprint"><span>✨ מתכון חדש שנסרק – כדאי לעבור עליו מול התמונה המקורית.</span><button class="btn sm" type="button" data-act="ok">בדקתי, הכל נכון</button></div>` : ""}
      <section class="panel"><h2>🧺 מצרכים</h2>${r.ingredients.length ? ingHTML(r.ingredients) : `<p class="hint">לא נרשמו מצרכים.</p>`}</section>
      <section class="panel"><h2>👩‍🍳 אופן ההכנה</h2>${r.steps.length ? stepsHTML(r.steps) + `<p class="noprint hint" style="margin:6px 0 0">טיפ: נגיעה בשלב מסמנת אותו כבוצע</p>` : `<p class="hint">לא נרשם אופן הכנה.</p>`}</section>
      ${notes.length ? `<section class="panel"><h2>💡 טיפים והערות חשובות</h2><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></section>` : ""}
      ${vids.length ? `<section class="panel vidpanel noprint"><h2>🎬 ${vids.length > 1 ? "סרטוני המתכון" : "סרטון המתכון"}</h2>${vids.map(v => `<video controls playsinline preload="metadata"${r.photo && isPath(r.photo) ? ` poster="${esc(r.photo)}"` : ""} src="${esc(v)}"></video>`).join("")}</section>` : ""}
      ${r.credit ? `<p class="src credit">👩‍🍳 המתכון של: <b>${esc(r.credit)}</b></p>` : ""}
      ${src ? `<p class="src">${src}</p>` : ""}
      ${(r.sourceImgs || []).length ? `<details class="orig"><summary>📷 תמונת המקור</summary><div class="scans">${r.sourceImgs.map((im, i) => `<a href="${isPath(im) ? esc(im) : "#"}" target="_blank" rel="noopener" data-full="${esc(im)}"><img alt="תמונת המקור ${i + 1}" loading="lazy" ${imgAttr(im)}></a>`).join("")}<small>נגיעה בתמונה פותחת אותה בגודל מלא</small></div></details>` : ""}
      <div class="ractions noprint"><button class="btn danger" type="button" data-act="del">🗑️ מחיקת המתכון</button></div>
    </article>
    ${more.length ? `<section class="more noprint"><h2>עוד ${esc(c.name)}</h2><ul class="grid">${more.map(cardHTML).join("")}</ul></section>` : ""}
    </div>`, {page: true});
  if (location.hash !== "#" + r.id) history.replaceState(null, "", "#" + r.id);
  fillImgs(p);
  p.addEventListener("click", async e => {
    const li = e.target.closest(".steps:not(.plain) li"); if (li) { li.classList.toggle("done"); return; }
    const o = e.target.closest("[data-open]"); if (o) { openRecipe(o.dataset.open); return; }
    const full = e.target.closest("a[data-full]"); if (full && !isPath(full.dataset.full)) { e.preventDefault(); const d = await getImg(full.dataset.full); if (d) { const w = window.open(); if (w) w.document.write(`<img src="${d}" style="max-width:100%">`); } return; }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "close") closeLayer();
    else if (act === "edit") openEditor(r);
    else if (act === "fav") { r.fav = !r.fav; await saveRecipe(r); openRecipe(r.id); }
    else if (act === "ok") { r.fresh = false; await saveRecipe(r); openRecipe(r.id); toast("מעולה, סומן כבדוק"); }
    else if (act === "share") openShare({kind: "recipe", ids: [r.id], title: r.title});
    else if (act === "photo") pickPhoto(async url => {
      const old = r.photo; r.photo = await putImg(url); r.photos = (r.photos || []).filter(x => x !== old && x !== r.photo); r.autoPhoto = false;
      if (r.builtin && old && isPath(old)) r.thumb = ""; // the old card picture belonged to the old photo
      await saveRecipe(r); if (old) await delImg(old); openRecipe(r.id); toast("התמונה עודכנה");
    });
    else if (act === "nophoto") {
      const cur = photos[0]; r.photos = (r.photos || []).filter(x => x !== cur); r.photo = r.photos[0] || null; r.autoPhoto = false;
      if (r.builtin) r.thumb = r.photo ? r.thumb : ""; await saveRecipe(r); await delImg(cur); openRecipe(r.id); toast("התמונה הוסרה");
    }
    else if (act === "del") {
      if (!a.classList.contains("armed")) { a.classList.add("armed"); a.textContent = "ללחוץ שוב כדי למחוק"; setTimeout(() => { if (a.isConnected) { a.classList.remove("armed"); a.textContent = "🗑️ מחיקת המתכון"; } }, 3500); return; }
      closeLayer(); await deleteRecipe(r.id); toast("המתכון נמחק");
    }
  });
  p.addEventListener("change", async e => {
    if (e.target.dataset.act === "setcat") { r.category = e.target.value; await saveRecipe(r); openRecipe(r.id); toast("הועבר ל" + catById(r.category).name); }
  });
}
let photoCb = null;
function pickPhoto(cb) { photoCb = cb; const f = $("#fPhoto"); f.value = ""; f.click(); }
$("#fPhoto").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file || !photoCb) return;
  try { const url = await compactURL(file, 1100); const cb = photoCb; photoCb = null; await cb(url); }
  catch { toast("לא ניתן לפתוח את התמונה. נסו JPG או PNG."); }
});

/* ---------- editor ---------- */
function catOptions(sel) { return cats().map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.emoji)} ${esc(c.name)}</option>`).join("") + `<option value="__new">+ קטגוריה חדשה…</option>`; }
function openEditor(r, {isNew} = {}) {
  const draft = clone(r);
  let newPhoto; // undefined = unchanged, null = removed, string = new data url
  const p = openLayer(head(isNew ? "מתכון חדש" : "עריכת מתכון") + `
    <form class="panel-b" id="edForm">
      <label class="field"><span>שם המתכון</span><input class="inp" id="edTitle" required value="${esc(isNew && draft.title === "מתכון ללא שם" ? "" : draft.title)}" placeholder="למשל: קציצות עוף של סבתא"${isNew ? " autofocus" : ""}></label>
      <label class="field"><span>משפט קצר על המנה (לא חובה)</span><input class="inp" id="edIntro" value="${esc(draft.intro)}" placeholder="למשל: העוגה שסבתא הכינה בכל שבת"></label>
      <div class="row2">
        <label class="field"><span>קטגוריה</span><select class="inp" id="edCat">${catOptions(draft.category)}</select></label>
        <label class="field"><span>כשרות</span><select class="inp" id="edK"><option value="">לא צוין</option>${Object.entries(KASH).map(([k, v]) => `<option value="${k}"${draft.k === k ? " selected" : ""}>${KASH_EMOJI[k]} ${v}</option>`).join("")}</select></label>
      </div>
      <label class="field" id="edNewCatWrap" hidden><span>שם הקטגוריה החדשה</span><input class="inp" id="edNewCat" placeholder="למשל: אוכל לתינוק"></label>
      <label class="check"><input type="checkbox" id="edPes"${draft.pesach ? " checked" : ""}><span>🍷 כשר לפסח</span></label>
      <div class="row2">
        <label class="field"><span>🔥 חום התנור</span><input class="inp" id="edTemp" value="${esc(draft.temp)}" placeholder="180 מעלות"></label>
        <label class="field"><span>⏱️ זמן</span><input class="inp" id="edTime" value="${esc(draft.time)}" placeholder="40 דקות"></label>
        <label class="field"><span>🍽️ כמות</span><input class="inp" id="edServ" value="${esc(draft.servings)}" placeholder="6 מנות"></label>
      </div>
      <label class="field"><span>🧺 מצרכים</span><small>מצרך בכל שורה. כותרת משנה: שורה שמתחילה ב-## (למשל ## לבצק)</small><textarea class="inp" id="edIng" rows="8">${esc(draft.ingredients.join("\n"))}</textarea></label>
      <label class="field"><span>👩‍🍳 אופן ההכנה</span><small>שלב בכל שורה, בלי מספרים – המספור אוטומטי. כותרת משנה: ##</small><textarea class="inp" id="edSteps" rows="8">${esc(draft.steps.join("\n"))}</textarea></label>
      <label class="field"><span>💡 טיפים והערות</span><small>הערה בכל שורה</small><textarea class="inp" id="edNotes" rows="3">${esc(draft.notes)}</textarea></label>
      <div class="row2">
        <label class="field"><span>👩‍🍳 המתכון של</span><input class="inp" id="edCredit" value="${esc(draft.credit)}" placeholder="למשל: סבתא סולטנה"></label>
        <label class="field"><span>תגיות</span><small>מופרדות בפסיק</small><input class="inp" id="edTags" value="${esc((draft.tags || []).join(", "))}" placeholder="חגים, מהיר"></label>
      </div>
      <label class="field"><span>קישור למקור (לא חובה)</span><input class="inp" id="edUrl" type="url" dir="ltr" value="${esc(draft.source && draft.source.url || "")}" placeholder="https://"></label>
      <div class="field"><span>📷 תמונה של המנה</span><div class="photo-pick" id="edPhotoBox"></div></div>
    </form>
    <div class="panel-f"><button class="btn primary" type="button" data-act="save">שמירה</button><button class="btn" type="button" data-act="close">ביטול</button></div>`);
  const box = $("#edPhotoBox", p);
  async function drawPhoto() {
    const cur = newPhoto === undefined ? await getImg(draft.photo) : newPhoto;
    box.innerHTML = (cur ? `<img alt="" src="${esc(cur)}">` : "") + `<button class="btn sm" type="button" data-act="ph">${cur ? "החלפה" : "בחירת תמונה"}</button>${cur ? `<button class="btn ghost sm" type="button" data-act="phx">הסרה</button>` : ""}`;
  }
  drawPhoto();
  $("#edCat", p).addEventListener("change", e => { $("#edNewCatWrap", p).hidden = e.target.value !== "__new"; if (e.target.value === "__new") $("#edNewCat", p).focus(); });
  $("#edForm", p).addEventListener("submit", e => e.preventDefault());
  p.addEventListener("click", async e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "close") { if (!isNew && S.recipes.some(x => x.id === r.id)) openRecipe(r.id); else closeLayer(); }
    else if (act === "ph") pickPhoto(url => { newPhoto = url; drawPhoto(); });
    else if (act === "phx") { newPhoto = null; drawPhoto(); }
    else if (act === "save") {
      const title = $("#edTitle", p).value.trim(); if (!title) { $("#edTitle", p).focus(); toast("צריך שם למתכון"); return; }
      let cat = $("#edCat", p).value;
      if (cat === "__new") { const nm = $("#edNewCat", p).value.trim(); if (!nm) { $("#edNewCat", p).focus(); return; } cat = await addCategory(nm); }
      const lines = v => v.split("\n").map(x => x.trim()).filter(Boolean);
      Object.assign(draft, {title, category: cat, k: $("#edK", p).value, pesach: $("#edPes", p).checked, intro: $("#edIntro", p).value.trim(),
        temp: $("#edTemp", p).value.trim(), time: $("#edTime", p).value.trim(), servings: $("#edServ", p).value.trim(),
        ingredients: lines($("#edIng", p).value), steps: lines($("#edSteps", p).value).map(x => x.replace(/^\d+[.)]\s*/, "")),
        notes: $("#edNotes", p).value.trim(), credit: $("#edCredit", p).value.trim(),
        tags: $("#edTags", p).value.split(/[,،]/).map(x => x.trim()).filter(Boolean), fresh: false});
      const url = $("#edUrl", p).value.trim();
      const src = Object.assign({type: "manual"}, draft.source);
      if (url) {
        if (["manual", "web", "text"].includes(src.type)) draft.source = {type: "web", url, label: hostOf(url)};
        else draft.source = Object.assign(src, {url});
      } else { delete src.url; delete src.alt; if (src.type === "web") src.type = "manual"; draft.source = src; }
      if (newPhoto !== undefined) {
        const old = draft.photo; draft.photo = newPhoto ? await putImg(newPhoto) : null; draft.autoPhoto = false;
        draft.photos = (draft.photos || []).filter(x => x !== old && x !== draft.photo);
        if (!draft.photo && draft.photos.length) draft.photo = draft.photos[0];
        if (draft.builtin && old && isPath(old)) draft.thumb = "";
        if (old) await delImg(old);
      }
      await saveRecipe(draft); toast("נשמר"); openRecipe(draft.id);
    }
  });
}
async function addCategory(name) {
  const ex = cats().find(c => c.name === name); if (ex) return ex.id;
  const used = cats().map(c => c.color);
  const c = {id: "c" + Math.random().toString(36).slice(2, 8), name, short: name, emoji: "🍴", color: CAT_COLORS.find(x => !used.includes(x)) || CAT_COLORS[customCats.length % CAT_COLORS.length]};
  customCats.push(c); await meta.set("customCats", customCats); return c.id;
}

/* ---------- new recipe menu ---------- */
function openNewMenu() {
  const p = openLayer(head("מתכון חדש") + `<div class="panel-b"><div class="opt-list">
    <button class="opt" type="button" data-act="manual"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg><div><b>כתיבה ידנית</b><span>ממלאים שם, מצרכים ושלבים</span></div></button>
    <button class="opt" type="button" data-act="paste"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/></svg><div><b>הדבקת טקסט או מתכון מאתר</b><span>האפליקציה מסדרת את הטקסט למתכון ושומרת את כתובת האתר כמקור</span></div></button>
    <button class="opt" type="button" data-act="scan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg><div><b>מתמונה או מתיקייה</b><span>כתב יד, צילום מסך, דף מספר</span></div></button>
  </div></div>`, {narrow: true});
  p.addEventListener("click", e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "close") closeLayer();
    if (a.dataset.act === "manual") openEditor(normRecipe({title: "", category: S.cat !== "all" && S.cat !== "pesach" ? S.cat : "other", pesach: S.cat === "pesach", k: S.k}), {isNew: true});
    if (a.dataset.act === "paste") openFinder("paste");
    if (a.dataset.act === "scan") openImporter();
  });
}

/* ---------- engine settings ---------- */
function engineBox() {
  return Gemini.on
    ? `<div class="engine smart"><div><b>סורק עם Gemini</b>קורא גם כתב יד, מזהה מתכונים וממיין בצורה חכמה. <button class="btn ghost sm" type="button" data-act="engine">הגדרות</button></div></div>`
    : `<div class="engine"><div><b>סריקה בתוך הדפדפן (חינם)</b>טובה לצילומי מסך ולטקסט מודפס. לכתב יד ולמיון חכם יותר אפשר לחבר מפתח Gemini חינמי. <button class="btn sm" type="button" data-act="engine">חיבור Gemini</button></div></div>`;
}
function openEngine(back) {
  const p = openLayer(head("מנוע הסריקה") + `<div class="panel-b">
    <p style="margin:0">בלי הגדרות, האפליקציה קוראת תמונות בתוך הדפדפן. זה חינמי לגמרי ועובד טוב על צילומי מסך ועל טקסט מודפס, אבל כמעט לא קורא כתב יד.</p>
    <p style="margin:0"><b>Gemini של Google</b> קורא גם כתב יד, ממיין טוב יותר ומחפש מתכונים אמיתיים באינטרנט עם קישור למקור. הוא חינמי עד מכסה יומית נדיבה.</p>
    <ol style="margin:0;padding-inline-start:22px;display:flex;flex-direction:column;gap:4px">
      <li>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> עם חשבון Google.</li>
      <li>לוחצים <b>Create API key</b> ומעתיקים את המפתח.</li>
      <li>מדביקים אותו כאן ושומרים.</li>
    </ol>
    <form id="keyForm" class="keyrow"><input class="inp" id="gkey" type="password" dir="ltr" autocomplete="off" placeholder="AIza..." value="${esc(Gemini.key)}"><button class="btn primary" type="submit">שמירה ובדיקה</button>${Gemini.on ? `<button class="btn ghost" type="button" data-act="rm">הסרת המפתח</button>` : ""}</form>
    <div id="keyMsg"></div>
    <p class="hint" style="margin:0">המפתח נשמר רק בדפדפן הזה ונשלח רק ל-Google. התמונות שסורקים עם Gemini נשלחות ל-Google לקריאה.</p>
  </div>`, {narrow: true});
  const done = () => back ? back() : closeLayer();
  p.addEventListener("click", e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "close") done();
    if (a.dataset.act === "rm") { Gemini.setKey(""); toast("המפתח הוסר. הסריקה תתבצע בדפדפן."); done(); }
  });
  $("#keyForm", p).addEventListener("submit", async e => {
    e.preventDefault();
    const k = $("#gkey", p).value.trim(); if (!k) return;
    const old = Gemini.key; Gemini.setKey(k);
    $("#keyMsg", p).innerHTML = dots("בודק את המפתח…");
    try {
      await Gemini.call([{text: 'Reply with only {"ok":true}'}], {json: true});
      toast("Gemini מחובר!"); done();
    } catch (err) {
      if (err.code === "bad_key") { Gemini.setKey(old); $("#keyMsg", p).innerHTML = `<p class="hint" style="color:var(--danger)">המפתח לא עובד. בדקו שהעתקתם אותו במלואו.</p>`; }
      else if (err.code === "rate_limited") { toast("המפתח נשמר (המכסה לרגע מלאה)"); done(); }
      else { $("#keyMsg", p).innerHTML = `<p class="hint">${esc(aiErr(err))} המפתח נשמר.</p>`; }
    }
  });
}

/* ---------- scanning photos ---------- */
const Imp = {items: [], running: false, ctl: null, one: false, lang: "keep", msg: "", saved: 0};
const MAX_GROUP = 8;
function isImageFile(f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(f.name); }
async function addFiles(files) {
  const scanned = await meta.get("scanned", {});
  const keys = new Set(Imp.items.map(i => i.key));
  let skipped = 0;
  for (const f of files) {
    if (!isImageFile(f)) continue;
    const key = (f.webkitRelativePath || f.name) + "|" + f.size;
    if (keys.has(key)) continue;
    keys.add(key);
    const it = {id: rid("q"), key, file: f, name: f.name, status: "wait", note: ""};
    if (scanned[key]) { it.status = scanned[key] === "recipe" ? "seen" : "seenNot"; it.note = "נסרק בעבר"; skipped++; }
    Imp.items.push(it);
  }
  drawImporterList();
  if (skipped) toast(`${skipped} תמונות כבר נסרקו בעבר ויסומנו לדילוג`);
  for (const it of Imp.items) if (!it.thumbURL && it.status !== "bad") {
    try { it.thumbURL = URL.createObjectURL(await fileToBlob(it.file, 260, .7)); } catch { it.status = "bad"; it.note = "הקובץ לא נפתח (אולי HEIC – המירו ל-JPG)"; }
    drawQueueItem(it);
  }
}
async function walkEntry(entry, out) {
  if (entry.isFile) { await new Promise(r => entry.file(f => { out.push(f); r(); }, r)); return; }
  if (entry.isDirectory) {
    const rd = entry.createReader();
    for (;;) { const batch = await new Promise(r => rd.readEntries(r, () => r([]))); if (!batch.length) break; for (const e of batch) await walkEntry(e, out); }
  }
}
function statusOf(it) {
  return ({wait: ["", "ממתין"], check: ["work", "בודק אם זה מתכון…"], queued: ["work", "מתכון! בתור לקריאה"], read: ["work", "קורא את המתכון…"], done: ["done", "נשמר"], not: ["not", "לא מתכון"],
    err: ["err", "שגיאה"], bad: ["err", "לא נתמך"], seen: ["not", "נסרק בעבר"], seenNot: ["not", "נסרק בעבר"]})[it.status] || ["", it.status];
}
function qiHTML(it) {
  const [cls, label] = statusOf(it);
  const canForce = !Imp.running && ["not", "err", "seenNot", "seen"].includes(it.status);
  return `<div class="qi" data-q="${it.id}">${it.thumbURL ? `<img alt="" src="${it.thumbURL}">` : `<img alt="">`}
    <div class="qb"><span class="qn" title="${esc(it.name)}">${esc(it.name)}</span><span class="st ${cls}">${label}</span>${it.note ? `<span class="hint" style="font-size:12px">${esc(it.note)}</span>` : ""}
    ${canForce ? `<button class="btn sm" type="button" data-force="${it.id}">${it.status === "err" ? "לנסות שוב" : it.status === "seen" ? "לסרוק שוב" : "זה כן מתכון"}</button>` : ""}
    ${it.recipeIds && it.recipeIds.length ? `<button class="btn sm" type="button" data-openr="${esc(it.recipeIds[0])}">פתיחה</button>` : ""}</div></div>`;
}
function drawQueueItem(it) { const el = document.querySelector(`[data-q="${it.id}"]`); if (el) el.outerHTML = qiHTML(it); updateImpSummary(); }
function drawImporterList() { const q = $("#qlist"); if (q) q.innerHTML = Imp.items.map(qiHTML).join(""); updateImpSummary(); }
function updateImpSummary() {
  const box = $("#impSum"); if (!box) return;
  const c = s => Imp.items.filter(i => s.includes(i.status)).length;
  const total = Imp.items.length, not = c(["not"]), err = c(["err", "bad"]), wait = c(["wait"]);
  const finished = Imp.items.filter(i => !["wait", "check", "queued", "read"].includes(i.status)).length;
  box.innerHTML = total || Imp.msg ? `<div class="sumline"><span>תמונות: <b>${total}</b></span><span>מתכונים שנשמרו: <b>${Imp.saved}</b></span><span>לא מתכון: <b>${not}</b></span>${err ? `<span>שגיאות: <b>${err}</b></span>` : ""}</div>
    <div class="prog" aria-hidden="true"><i style="width:${total ? Math.round(finished / total * 100) : 0}%"></i></div>${Imp.msg ? `<p class="hint" style="margin:0">${esc(Imp.msg)}</p>` : ""}` : "";
  const go = $("#impGo"); if (go) { go.disabled = Imp.running || !wait; go.textContent = Imp.running ? "סורק…" : wait ? `התחלת סריקה (${wait})` : "בחרו תמונות לסריקה"; }
  const stop = $("#impStop"); if (stop) stop.hidden = !Imp.running;
}
function openImporter() {
  const p = openLayer(head("סריקת תמונות") + `<div class="panel-b">
    ${engineBox()}
    <div class="drop" id="drop">
      <h3>גררו לכאן תיקייה או תמונות</h3>
      <p class="hint" style="margin:0">כל תמונה נבדקת: מה שאינו מתכון מדולג, והמתכונים מוקלדים וממוינים לקטגוריות.</p>
      <div class="btns"><button class="btn primary" type="button" data-act="folder">בחירת תיקייה</button><button class="btn" type="button" data-act="files">בחירת תמונות</button></div>
    </div>
    <div class="opts">
      <label class="check"><input type="checkbox" id="impOne"${Imp.one ? " checked" : ""}><span><b>כל התמונות שבחרתי הן מתכון אחד</b> – למשל כמה עמודים או צילומי מסך של אותו מתכון (עד ${MAX_GROUP} תמונות)</span></label>
      ${Gemini.on ? `<label class="check"><input type="checkbox" id="impHe"${Imp.lang === "he" ? " checked" : ""}><span>לתרגם לעברית מתכונים בשפות אחרות</span></label>` : ""}
    </div>
    <div id="impSum"></div>
    <div class="qlist" id="qlist">${Imp.items.map(qiHTML).join("")}</div>
  </div>
  <div class="panel-f"><button class="btn primary" id="impGo" type="button" data-act="go">התחלת סריקה</button><button class="btn" id="impStop" type="button" data-act="stop" hidden>עצירה</button><button class="btn ghost" type="button" data-act="clear">ניקוי הרשימה</button><button class="btn ghost" type="button" data-act="close">סגירה</button></div>`);
  updateImpSummary();
  const drop = $("#drop", p);
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", async e => {
    e.preventDefault(); drop.classList.remove("over");
    const out = []; const items = [...(e.dataTransfer.items || [])];
    const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (entries.length) { for (const en of entries) await walkEntry(en, out); } else out.push(...e.dataTransfer.files);
    addFiles(out);
  });
  $("#impOne", p).addEventListener("change", e => Imp.one = e.target.checked);
  const he = $("#impHe", p); if (he) he.addEventListener("change", e => Imp.lang = e.target.checked ? "he" : "keep");
  p.addEventListener("click", e => {
    const f = e.target.closest("[data-force]"); if (f) { const it = Imp.items.find(i => i.id === f.dataset.force); if (it) runImport([it]); return; }
    const o = e.target.closest("[data-openr]"); if (o) { openRecipe(o.dataset.openr); return; }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "close") closeLayer();
    else if (act === "engine") openEngine(openImporter);
    else if (act === "folder") { const i = $("#fFolder"); i.value = ""; i.click(); }
    else if (act === "files") { const i = $("#fFiles"); i.value = ""; i.click(); }
    else if (act === "go") runImport();
    else if (act === "stop") { if (Imp.ctl) Imp.ctl.abort(); }
    else if (act === "clear") { if (Imp.running) return; Imp.items.forEach(i => i.thumbURL && URL.revokeObjectURL(i.thumbURL)); Imp.items = []; Imp.saved = 0; Imp.msg = ""; openImporter(); }
  });
}
$("#fFolder").addEventListener("change", e => addFiles([...e.target.files]));
$("#fFiles").addEventListener("change", e => addFiles([...e.target.files]));

function langRule() { return Imp.lang === "he" ? "Write all recipe text in Hebrew, translating if the source is in another language." : "Keep the recipe text in the language it is written in (do not translate)."; }
async function classifyBatch(batch, signal) {
  const blobs = [];
  for (const it of batch) blobs.push(await fileToBlob(it.file, 760, .75));
  const prompt = `You are sorting photos from someone's phone gallery to find recipes. There are ${batch.length} images, in order: image 1 … image ${batch.length}.
For each image decide whether it shows a recipe or part of one: an ingredient list and/or preparation instructions — a handwritten note, a cookbook or magazine page, a recipe card, or a screenshot of a website, chat message or social post. A photo of food or a finished dish with no written recipe is NOT a recipe. A menu, receipt or shopping list is NOT a recipe.
Reply with only a JSON array, one object per image, in order: [{"i":1,"recipe":true,"why":"up to 5 Hebrew words"}]`;
  const res = await Gemini.json(prompt, {images: blobs, signal});
  const arr = Array.isArray(res) ? res : (res && Array.isArray(res.images) ? res.images : []);
  return batch.map((it, k) => { const o = arr.find(x => Number(x.i) === k + 1) || arr[k] || {}; return {recipe: o.recipe !== false, why: String(o.why || "")}; });
}
async function extractGemini(items, signal, forced) {
  const blobs = [];
  for (const it of items) blobs.push(await fileToBlob(it.file, 1800, .88));
  const multi = items.length > 1;
  const prompt = `You are digitizing a family recipe collection. ${multi ? `The ${items.length} attached images are consecutive pages or screenshots of ONE recipe, in order.` : "The attached image is a photo or screenshot that may contain a recipe."} It may be handwritten — read handwriting carefully, using cooking context to resolve unclear words.
${forced ? "The user says this image contains a recipe; extract whatever recipe content you can." : `If the image does not contain a recipe (ingredients and/or preparation steps), reply {"isRecipe": false, "reason": "short reason in Hebrew"}.`}
Otherwise reply {"isRecipe": true, "recipes": [ ... ]}${multi ? " with exactly one recipe" : " — more than one item only if the image holds several separate recipes"}. Each recipe is:
${RECIPE_SHAPE()}
Also give each recipe "dishPhoto": if the image${multi ? "s include" : " includes"} a photograph of the prepared dish or food (not of text, a page or a hand), its location as {"image": ${multi ? "the image number, from 1" : "1"}, "box_2d": [ymin, xmin, ymax, xmax]} on a 0-1000 scale; otherwise null.
Rules: transcribe faithfully — never invent quantities, ingredients or steps that are not there; write an unreadable word as [?]. If an ingredient is mentioned only inside the steps, still list it in ingredients. If there is no title, give a short descriptive Hebrew title. Choose the category by what the dish is. Use the category names exactly as listed. ${langRule()}`;
  return Gemini.json(prompt, {images: blobs, signal});
}
/* built-in path: OCR each photo, then decide and parse by rules */
async function extractLocal(items, signal, forced) {
  const texts = [];
  for (const it of items) {
    if (signal.aborted) throw {code: "cancelled"};
    if (it.ocr == null) it.ocr = await Local.ocr(it.file);
    texts.push(it.ocr.text);
  }
  if (signal.aborted) throw {code: "cancelled"};
  const text = texts.join("\n");
  const sc = recipeScore(text);
  if (!forced && !sc.ok) return {isRecipe: false, reason: text.trim().length < 15 ? "אין בתמונה טקסט" : "לא נראה כמו מתכון"};
  const r = parseRecipeText(text, items[0].name);
  if (!r.ingredients.length && !r.steps.length) return {isRecipe: false, reason: "לא הצלחתי לקרוא טקסט"};
  for (let k = 0; k < items.length && !r.dishPhoto; k++) {
    try { const box = await findPhotoBox(items[k].file, items[k].ocr); if (box) r.dishPhoto = {image: k + 1, box_2d: box}; } catch {}
  }
  return {isRecipe: true, recipes: [r]};
}
async function saveExtracted(items, res) {
  const recs = (res && Array.isArray(res.recipes)) ? res.recipes : [];
  if (!res || res.isRecipe === false || !recs.length) return [];
  const srcIds = [];
  for (const it of items) { try { srcIds.push(await putImg(await compactURL(it.file, 1400))); } catch {} }
  const out = [];
  for (const o of recs) {
    const r = normRecipe(o, {sourceImgs: srcIds.slice(), source: {type: "image", label: items.map(i => i.name).join(", ")}, fresh: true});
    const dp = o.dishPhoto;
    if (dp && typeof dp === "object") {
      const it = items[Math.max(0, Math.min(items.length - 1, (Number(dp.image) || 1) - 1))];
      try { const url = await cropPhoto(it.file, dp.box_2d || dp.box); if (url) { r.photo = await putImg(url); r.autoPhoto = true; } } catch {}
    }
    delete r.dishPhoto;
    await saveRecipe(r, {quiet: true}); out.push(r.id);
  }
  return out;
}
async function markScanned(items, val) {
  const scanned = await meta.get("scanned", {}); for (const it of items) scanned[it.key] = val; await meta.set("scanned", scanned);
}
const FATAL = ["bad_key", "rate_limited", "ocr_load", "no_model"];
async function runImport(only) {
  if (Imp.running) return;
  const forced = !!only;
  const todo = only || Imp.items.filter(i => i.status === "wait");
  if (!todo.length) return;
  const smart = Gemini.on;
  const extract = smart ? extractGemini : extractLocal;
  Imp.running = true; Imp.ctl = new AbortController(); Imp.msg = ""; const signal = Imp.ctl.signal;
  const onAbort = () => { if (!smart) Local.stop(); };
  signal.addEventListener("abort", onAbort);
  Local.onStatus = m => { Imp.msg = m; updateImpSummary(); };
  Gemini.onWait = s => { Imp.msg = `Gemini ביקש להמתין ${s} שניות (מכסה לדקה)…`; updateImpSummary(); };
  const set = (it, st, note = "") => { it.status = st; it.note = note; drawQueueItem(it); };
  let fatal = null;
  try {
    if (Imp.one && !forced) {
      const group = todo.slice(0, MAX_GROUP);
      group.forEach(i => set(i, "read"));
      try {
        const res = await extract(group, signal, true);
        const ids = await saveExtracted(group, res);
        group.forEach(i => { i.recipeIds = ids; set(i, ids.length ? "done" : "not", ids.length ? "" : "לא נמצא מתכון"); });
        Imp.saved += ids.length; await markScanned(group, ids.length ? "recipe" : "not");
        if (todo.length > group.length) Imp.msg = `נסרקו ${group.length} התמונות הראשונות כמתכון אחד. היתר נשארו ברשימה.`;
      } catch (e) {
        group.forEach(i => set(i, e.code === "cancelled" ? "wait" : "err", e.code === "cancelled" ? "" : aiErr(e)));
        if (FATAL.includes(e.code)) fatal = e;
      }
    } else {
      // 1) with Gemini: a quick check of which photos are recipes, in batches
      let recipes = todo;
      if (smart && !forced && todo.length > 1) {
        recipes = [];
        for (let k = 0; k < todo.length && !signal.aborted && !fatal; k += MAX_GROUP) {
          const batch = todo.slice(k, k + MAX_GROUP); batch.forEach(i => set(i, "check"));
          try {
            const verdicts = await classifyBatch(batch, signal);
            batch.forEach((it, j) => { if (verdicts[j].recipe) { set(it, "queued"); recipes.push(it); } else set(it, "not", verdicts[j].why); });
            await markScanned(batch.filter(i => i.status === "not"), "not");
          } catch (e) {
            batch.forEach(i => set(i, "wait"));
            if (e.code === "cancelled") break;
            if (FATAL.includes(e.code)) { fatal = e; break; }
            batch.forEach(i => set(i, "err", aiErr(e)));
          }
          Imp.msg = ""; updateImpSummary();
        }
      }
      // 2) read each recipe photo (two at a time with Gemini, one at a time in the browser)
      const queue = recipes.slice();
      const worker = async () => {
        while (queue.length && !signal.aborted && !fatal) {
          const it = queue.shift(); set(it, smart ? "read" : "check");
          try {
            const res = await extract([it], signal, forced);
            const ids = await saveExtracted([it], res);
            it.recipeIds = ids; Imp.saved += ids.length;
            if (ids.length) set(it, "done", ids.length > 1 ? `${ids.length} מתכונים` : (S.recipes.find(r => r.id === ids[0]) || {}).title || "");
            else set(it, "not", res && res.reason || "");
            await markScanned([it], ids.length ? "recipe" : "not");
            render();
          } catch (e) {
            if (e.code === "cancelled" || signal.aborted) { set(it, "wait"); break; }
            if (FATAL.includes(e.code)) { fatal = e; set(it, "wait"); break; }
            set(it, "err", aiErr(e));
          }
        }
      };
      await Promise.all(smart ? [worker(), worker()] : [worker()]);
      Imp.items.filter(i => ["queued", "check", "read"].includes(i.status)).forEach(i => set(i, "wait"));
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    Imp.running = false; Imp.ctl = null;
    if (fatal) Imp.msg = aiErr(fatal);
    else if (signal.aborted) Imp.msg = "הסריקה נעצרה. אפשר להמשיך מאותה נקודה.";
    else Imp.msg = Imp.saved ? "סיום! המתכונים החדשים מסומנים 'חדש · לבדיקה' – כדאי לעבור עליהם מול התמונה המקורית." + (smart ? "" : " תמונה שדולגה בטעות? לחצו 'זה כן מתכון'.") : "הסריקה הסתיימה.";
    drawImporterList(); render();
  }
}

/* ---------- finding recipes: web search with sources (Gemini) + import from a page ---------- */
const Find = {mode: "web", results: [], sources: [], query: "", busy: false, ctl: null};
const SUGG = ["משהו מהיר לארוחת ערב", "עוגה בלי מיקסר", "תבשיל עוף לשבת", "סלט לחג", "קינוח פרווה", "מנה טבעונית עשירה בחלבון"];
const gLink = q => "https://www.google.com/search?q=" + encodeURIComponent(q);
const yLink = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
function matchSource(name, sources) {
  const n = String(name || "").toLowerCase().replace(/^www\./, "").trim(); if (!n) return null;
  return sources.find(s => { const t = String(s.title || "").toLowerCase(); return t && (t.includes(n) || n.includes(t.replace(/^www\./, ""))); }) || null;
}
function openFinder(mode) {
  if (mode) Find.mode = mode;
  const p = openLayer(head("חיפוש מתכון") + `<div class="panel-b">
    <div class="seg" role="group" aria-label="סוג חיפוש"><button type="button" data-mode="web" aria-pressed="${Find.mode === "web"}">חיפוש באינטרנט</button><button type="button" data-mode="paste" aria-pressed="${Find.mode === "paste"}">ייבוא מאתר או מטקסט</button></div>
    <div id="findBody"></div>
  </div>`);
  const draw = () => {
    const b = $("#findBody", p);
    if (Find.mode === "web") {
      b.innerHTML = `<form id="ideaForm" style="display:flex;flex-direction:column;gap:12px">
        <label class="field"><span>מה מתחשק לכם?</span><div style="display:flex;gap:8px"><input class="inp" id="fq" value="${esc(Find.query)}" placeholder="למשל: פשטידת ירקות בלי קמח" autofocus><button class="btn primary" type="submit"${Find.busy ? " disabled" : ""}>חיפוש</button></div></label>
        <div class="sugg">${SUGG.map(s => `<button type="button" class="chip" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        ${Gemini.on ? `<p class="hint" style="margin:0">Gemini מחפש בגוגל, מביא 3 מתכונים מאתרים שונים ומציין מאיזה אתר כל אחד הגיע.</p>`
          : `<div class="engine"><div><b>חיפוש חכם דורש מפתח Gemini חינמי</b>בלי מפתח, החיפוש פותח את גוגל או את יוטיוב, ואת המתכון שמצאתם מדביקים ב"ייבוא מאתר". <button class="btn sm" type="button" data-act="engine">חיבור Gemini</button></div></div>`}
      </form><div id="fres" style="display:flex;flex-direction:column;gap:12px"></div>`;
      drawResults();
    } else {
      b.innerHTML = `<form id="pasteForm" style="display:flex;flex-direction:column;gap:12px">
        <label class="field"><span>כתובת האתר (לא חובה, נשמרת כמקור)</span><input class="inp" id="purl" type="url" dir="ltr" placeholder="https://..."></label>
        <label class="field"><span>טקסט המתכון</span><small>פתחו את המתכון באתר, סמנו הכל, העתיקו והדביקו כאן. אפשר גם טקסט מוואטסאפ או ממייל.</small><textarea class="inp" id="ptext" rows="10" placeholder="מצרכים: …"></textarea></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit"${Find.busy ? " disabled" : ""}>סידור ושמירה במחברת</button></div>
        <div id="pmsg"></div>
      </form>`;
    }
  };
  const drawResults = () => {
    const box = $("#fres", p); if (!box) return;
    if (Find.busy) { box.innerHTML = dots(`מחפש באינטרנט… זה יכול לקחת עד דקה. <button class="btn sm" type="button" data-act="stopf">עצירה</button>`); return; }
    if (!Gemini.on && Find.query) {
      box.innerHTML = `<article class="res"><h3>${esc(Find.query)}</h3><div class="from"><a href="${gLink("מתכון " + Find.query)}" target="_blank" rel="noopener">חיפוש בגוגל ↗</a><a href="${yLink("מתכון " + Find.query)}" target="_blank" rel="noopener">חיפוש ביוטיוב ↗</a></div><p class="hint" style="margin:0">מצאתם מתכון? העתיקו את הטקסט שלו והדביקו ב"ייבוא מאתר".</p><div><button class="btn sm" type="button" data-mode="paste">מעבר לייבוא מאתר</button></div></article>`;
      return;
    }
    box.innerHTML = Find.results.map((r, k) => {
      const cid = catFromName(r.category); const c = catById(cid);
      const src = r._src;
      return `<article class="res"><div class="badges"><span class="badge" style="background:${c.color}">${esc(c.emoji)} ${esc(c.name)}</span>${r.kashrut && KASH[r.kashrut] ? `<span class="badge k-${r.kashrut}">${KASH[r.kashrut]}</span>` : ""}${r.time ? `<span class="badge">⏱️ ${esc(r.time)}</span>` : ""}</div>
        <h3>${esc(r.title)}</h3>${r.summary ? `<p style="margin:0">${esc(r.summary)}</p>` : ""}
        <div class="from"><span><b>מקור:</b> ${src ? `<a href="${esc(src.uri)}" target="_blank" rel="noopener">${esc(src.title || r.sourceName)} ↗</a>` : esc(r.sourceName || "לא צוין")}</span>${r.sourceName ? `<a href="${gLink(r.title + " " + r.sourceName)}" target="_blank" rel="noopener">חיפוש המתכון באתר</a>` : ""}</div>
        <details><summary>הצגת המתכון</summary><b>מצרכים</b><ul>${(r.ingredients || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul><b>אופן ההכנה</b><ol>${(r.steps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>${r.notes ? `<p>${esc(r.notes)}</p>` : ""}</details>
        <div><button class="btn primary sm" type="button" data-savef="${k}"${r._saved ? " disabled" : ""}>${r._saved ? "נשמר במחברת ✓" : "שמירה במחברת"}</button></div></article>`;
    }).join("") + (Find.sources.length ? `<div class="srcs"><b>כל האתרים שנמצאו בחיפוש:</b>${Find.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join("")}</div>` : "");
  };
  const search = async q => {
    if (!q || Find.busy) return;
    Find.query = q;
    if (!Gemini.on) { drawResults(); return; }
    Find.busy = true; Find.results = []; Find.sources = []; Find.ctl = new AbortController(); drawResults();
    const sb = $("#ideaForm button[type=submit]", p); if (sb) sb.disabled = true;
    try {
      const {value, sources} = await Gemini.json(`Search the web for home recipes matching: "${q}".
Choose 3 different real recipes from 3 different websites (when the request is in Hebrew, prefer Israeli recipe sites). Copy each recipe faithfully from its page — the ingredients and steps as that page gives them — written in Hebrew (translate if the page is not in Hebrew). Do not invent recipes.
Reply with only JSON, no other text: {"results":[{"title":"","sourceName":"the website's domain, e.g. foodish.co.il","category": one of [${catNames()}],"kashrut":"parve|dairy|meat","summary":"one sentence","servings":"","time":"","ingredients":["..."],"steps":["..."],"notes":""}]}`, {search: true, signal: Find.ctl.signal});
      Find.sources = sources || [];
      Find.results = (value && Array.isArray(value.results) ? value.results : []).slice(0, 4).map(r => Object.assign(r, {_src: matchSource(r.sourceName, Find.sources)}));
      if (!Find.results.length) toast("לא נמצאו תוצאות. נסו לנסח אחרת.");
    } catch (e) { if (e.code !== "cancelled") toast(aiErr(e), 4500); }
    Find.busy = false; Find.ctl = null;
    if (p.isConnected) draw();
  };
  draw();
  p.addEventListener("click", async e => {
    const m = e.target.closest("[data-mode]"); if (m) { Find.mode = m.dataset.mode; $$(".seg [data-mode]", p).forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === Find.mode)); draw(); return; }
    const s = e.target.closest("[data-sugg]"); if (s) { $("#fq", p).value = s.dataset.sugg; search(s.dataset.sugg); return; }
    const sv = e.target.closest("[data-savef]"); if (sv) {
      const o = Find.results[+sv.dataset.savef]; if (!o || o._saved) return;
      const src = o._src;
      const source = {type: "web", label: (src && src.title) || o.sourceName || "אתר", url: src ? src.uri : "", alt: o.sourceName ? gLink(o.title + " " + o.sourceName) : ""};
      if (!source.url) { source.url = source.alt; delete source.alt; }
      const r = normRecipe(o, {source, fresh: true});
      await saveRecipe(r); o._saved = true; drawResults(); toast("נשמר בקטגוריה " + catById(r.category).name); return;
    }
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "close") closeLayer();
    if (a.dataset.act === "engine") openEngine(() => openFinder());
    if (a.dataset.act === "stopf" && Find.ctl) Find.ctl.abort();
  });
  p.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id === "ideaForm") search($("#fq", p).value.trim());
    if (e.target.id === "pasteForm") {
      const text = $("#ptext", p).value.trim(), url = $("#purl", p).value.trim();
      if (text.length < 20) { toast("הדביקו את טקסט המתכון"); return; }
      const btn = $("#pasteForm button[type=submit]", p); btn.disabled = true;
      const source = url ? {type: "web", url, label: hostOf(url)} : {type: "text"};
      if (!Gemini.on) {
        const r = normRecipe(parseRecipeText(text, ""), {source, fresh: true});
        if (r.title === "מתכון מסריקה") r.title = url ? "מתכון מ-" + hostOf(url) : "מתכון חדש";
        await saveRecipe(r); toast("נשמר. כדאי לעבור על הסידור"); openRecipe(r.id); return;
      }
      $("#pmsg", p).innerHTML = dots("מסדר את המתכון…");
      try {
        const res = await Gemini.json(`Turn this pasted text into a structured recipe. The text was copied from ${url ? "the web page " + url : "a message or web page"} and may include ads, comments or navigation — ignore those. Transcribe faithfully, without inventing anything. Keep the original language.
If the text holds no recipe, reply {"isRecipe": false}. Otherwise reply {"isRecipe": true, "recipe": ${RECIPE_SHAPE()}}.

TEXT:
${text.slice(0, 60000)}`);
        if (!res || res.isRecipe === false || !res.recipe) { $("#pmsg", p).innerHTML = `<p class="hint">לא מצאתי מתכון בטקסט הזה.</p>`; }
        else { const r = normRecipe(res.recipe, {source, fresh: true}); await saveRecipe(r); toast("נשמר במחברת"); openRecipe(r.id); return; }
      } catch (err) { $("#pmsg", p).innerHTML = `<p class="hint">${esc(aiErr(err))}</p>`; }
      btn.disabled = false;
    }
  });
}

/* ---------- sharing ---------- */
function recipeText(r) {
  const c = catById(r.category); const L = [];
  L.push("*" + r.title + "*");
  L.push([c.name, KASH[r.k], r.pesach && "כשר לפסח", r.temp && "חום: " + r.temp, r.servings && "כמות: " + r.servings, r.time && "זמן: " + r.time].filter(Boolean).join(" · "));
  if (r.intro) L.push(r.intro);
  if (r.ingredients.length) { L.push("", "*מצרכים*"); r.ingredients.forEach(x => L.push(/^#/.test(x) ? "_" + x.replace(/^#+\s*/, "") + "_" : "• " + x)); }
  if (r.steps.length) { L.push("", "*אופן ההכנה*"); let n = 0; r.steps.forEach(x => L.push(/^#/.test(x) ? "_" + x.replace(/^#+\s*/, "") + "_" : (++n) + ". " + x)); }
  if (r.notes) L.push("", "*טיפים והערות*", r.notes);
  if (r.credit) L.push("", "המתכון של: " + r.credit);
  const s = r.source || {}; if (s.url) L.push("", "מקור: " + s.url);
  return L.join("\n");
}
async function bundle(list, withImages) {
  const images = {};
  const recipes = list.map(r => { const o = clone(r); delete o.fresh; delete o.sample; return o; });
  if (withImages) for (const r of recipes) for (const id of [r.photo, ...(r.photos || []), ...(r.sourceImgs || [])].filter(Boolean)) { if (isPath(id)) continue; const d = await getImg(id); if (d) images[id] = d; }
  if (!withImages) recipes.forEach(r => { r.photo = null; r.photos = []; r.sourceImgs = []; });
  return {app: "recipe-notebook", version: 1, exportedAt: new Date().toISOString(), categories: customCats, recipes, images};
}
/* share links carry the recipes inside the link itself (compressed), no server needed */
const b64u = {
  enc(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec(str) { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; },
};
async function packLink(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) {
    const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return "z" + b64u.enc(new Uint8Array(buf));
  }
  return "p" + b64u.enc(raw);
}
async function unpackLink(code) {
  const bytes = b64u.dec(code.slice(1));
  let raw = bytes;
  if (code[0] === "z") raw = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(raw));
}
const slim = r => { const o = {t: r.title, c: catById(r.category).name, i: r.ingredients, s: r.steps}; if (r.servings) o.v = r.servings; if (r.time) o.m = r.time; if (r.temp) o.h = r.temp; if (r.notes) o.n = r.notes; if (r.tags && r.tags.length) o.g = r.tags; if (r.source && r.source.url) o.u = r.source.url; if (r.k) o.k = r.k; if (r.pesach) o.p = 1; if (r.credit) o.b = r.credit; if (r.intro) o.x = r.intro; if (r.photo && /^img\//.test(r.photo)) o.f = r.photo; return o; };
const unslim = o => ({title: o.t, category: o.c, ingredients: o.i, steps: o.s, servings: o.v, time: o.m, temp: o.h, notes: o.n, tags: o.g, url: o.u, k: o.k, pesach: !!o.p, credit: o.b, intro: o.x, photo: o.f && /^img\/[\w./-]+$/.test(o.f) ? o.f : ""});
function scopeList(sc) {
  if (sc.kind === "all") return S.recipes.filter(r => !r.sample);
  if (sc.kind === "cat") return S.recipes.filter(r => r.category === sc.cat);
  return S.recipes.filter(r => sc.ids.includes(r.id));
}
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, " ").trim();
function openShare(sc) {
  const list = scopeList(sc);
  const title = sc.kind === "all" ? "כל המחברת" : sc.kind === "cat" ? catById(sc.cat).name : sc.title;
  const canNative = !!navigator.share;
  const p = openLayer(head("שיתוף") + `<div class="panel-b">
    <p style="margin:0">משתפים: <b>${esc(title)}</b> · ${list.length} ${list.length === 1 ? "מתכון" : "מתכונים"}. המחברת שלכם נשארת פרטית; רק מה שתשתפו יוצא.</p>
    <div class="opt-list">
      <button class="opt" type="button" data-act="link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg><div><b>קישור לשיתוף</b><span>מי שפותח את הקישור רואה את המתכונים ושומר אותם במחברת שלו (בלי התמונות)</span></div></button>
      ${canNative ? `<button class="opt" type="button" data-act="native"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg><div><b>שליחה כטקסט</b><span>וואטסאפ, הודעה, מייל…</span></div></button>` : ""}
      <button class="opt" type="button" data-act="text"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg><div><b>העתקה כטקסט</b><span>להדבקה בכל מקום</span></div></button>
      <button class="opt" type="button" data-act="file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><div><b>קובץ מתכונים עם תמונות</b><span>מי שמקבל פותח את האפליקציה ובוחר בתפריט "ייבוא קובץ"</span></div></button>
    </div>
    <div id="shOut"></div>
  </div>`, {narrow: true});
  p.addEventListener("click", async e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const out = $("#shOut", p);
    if (a.dataset.act === "close") { if (sc.kind === "recipe" && sc.ids.length === 1) openRecipe(sc.ids[0]); else closeLayer(); }
    if (a.dataset.act === "text" || a.dataset.act === "native") {
      const txt = list.map(recipeText).join("\n\n— — —\n\n");
      if (a.dataset.act === "native") { try { await navigator.share({title, text: txt}); } catch {} return; }
      try { await navigator.clipboard.writeText(txt); toast("הועתק! אפשר להדביק"); out.innerHTML = ""; }
      catch { out.innerHTML = `<label class="field"><span>העתיקו את הטקסט:</span><textarea class="inp copybox" readonly>${esc(txt)}</textarea></label>`; const t = $("textarea", out); t.focus(); t.select(); }
    }
    if (a.dataset.act === "file") {
      const b = await bundle(list, true); const name = `מתכונים - ${safeName(title)}.json`; const json = JSON.stringify(b);
      try {
        const f = new File([json], name, {type: "application/json"});
        if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title}); return; }
      } catch (err) { if (err && err.name === "AbortError") return; }
      downloadFile(name, json); toast("הקובץ ירד למכשיר");
    }
    if (a.dataset.act === "link") {
      const code = await packLink({t: title, r: list.map(slim)});
      const link = location.origin + location.pathname + "#s=" + code;
      const long = link.length > 30000;
      out.innerHTML = `<label class="field"><span>${long ? "הקישור ארוך מאוד – עדיף לשתף כקובץ" : "הקישור מוכן:"}</span><input class="inp" dir="ltr" readonly value="${esc(link)}"></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="copylink">העתקה</button>${canNative ? `<button class="btn sm" type="button" data-act="sharelink">שליחה</button>` : ""}</div>`;
      out.dataset.link = link;
      try { await navigator.clipboard.writeText(link); toast("הקישור הועתק"); } catch {}
    }
    if (a.dataset.act === "copylink") { try { await navigator.clipboard.writeText(out.dataset.link); toast("הועתק"); } catch { const i = $("input", out); i.focus(); i.select(); } }
    if (a.dataset.act === "sharelink") { try { await navigator.share({title: "מתכונים: " + title, url: out.dataset.link}); } catch {} }
  });
}
async function openSharedLink(code) {
  const p = openLayer(head("מתכונים ששותפו איתכם") + `<div class="panel-b" id="shBody">${dots("פותח…")}</div>`, {narrow: true});
  p.addEventListener("click", e => { if (e.target.closest("[data-act=close]")) closeLayer(); });
  let data;
  try { data = await unpackLink(code); } catch { $("#shBody", p).innerHTML = `<p>הקישור פגום או חלקי. בקשו מהשולח לשלוח אותו שוב.</p>`; return; }
  const items = (data && Array.isArray(data.r) ? data.r : []).map(unslim);
  if (!items.length) { $("#shBody", p).innerHTML = `<p>אין מתכונים בקישור הזה.</p>`; return; }
  $("#shBody", p).innerHTML = `<p style="margin:0">שותפו איתכם <b>${items.length}</b> ${items.length === 1 ? "מתכון" : "מתכונים"}${data.t ? ` מתוך "${esc(data.t)}"` : ""}:</p>
    <ul style="margin:0;padding-inline-start:20px">${items.map(i => `<li>${esc(i.title)}</li>`).join("")}</ul>
    <div><button class="btn primary" type="button" id="shSave">שמירה במחברת שלי</button></div>`;
  $("#shSave", p).addEventListener("click", async ev => {
    ev.target.disabled = true;
    for (const it of items) {
      const source = it.url ? {type: "web", url: it.url, label: hostOf(it.url)} : {type: "shared", label: data.t || ""};
      await saveRecipe(normRecipe(it, {source, photo: it.photo || null}), {quiet: true});
    }
    render(); closeLayer(); toast(`${items.length} מתכונים נשמרו במחברת`);
  });
}
async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "recipe-notebook" || !Array.isArray(data.recipes)) throw 0;
    for (const c of data.categories || []) if (c && c.name && !cats().some(x => x.name === c.name)) customCats.push({id: c.id || ("c" + Math.random().toString(36).slice(2, 8)), name: c.name, h: c.h ?? 160});
    await meta.set("customCats", customCats);
    const imgMap = {}; let n = 0, upd = 0;
    for (const [id, d] of Object.entries(data.images || {})) imgMap[id] = await putImg(d);
    for (const o of data.recipes) {
      const ex = S.recipes.find(r => r.id === o.id);
      if (ex && (ex.updatedAt || 0) >= (o.updatedAt || 0)) continue;
      const pic = i => imgMap[i] || (isPath(i) && /^img\//.test(i) ? i : null);
      const r = normRecipe(o, {id: ex ? ex.id : (o.id || rid()), photo: o.photo ? pic(o.photo) : null, photos: (o.photos || []).map(pic).filter(Boolean), thumb: o.thumb && /^img\//.test(o.thumb) ? o.thumb : "",
        sourceImgs: (o.sourceImgs || []).map(pic).filter(Boolean), video: /^vid\/[\w.-]+$/.test(o.video || "") ? o.video : "", videos: (o.videos || []).filter(v => /^vid\/[\w.-]+$/.test(v)), builtin: !!o.builtin, autoPhoto: !!o.autoPhoto, source: o.source || {type: "shared"}, fav: !!o.fav, createdAt: o.createdAt || now()});
      if (ex) { if (ex.photo && ex.photo !== r.photo) await delImg(ex.photo); upd++; } else n++;
      await saveRecipe(r, {quiet: true});
    }
    render(); toast(`נוספו ${n} מתכונים${upd ? `, ${upd} עודכנו` : ""}`);
  } catch { toast("הקובץ הזה לא נראה כמו קובץ של מחברת המתכונים"); }
}
$("#fJson").addEventListener("change", e => { const f = e.target.files[0]; if (f) { closeLayer(); importFile(f); } });

/* ---------- menu ---------- */
function openMenu() {
  const n = S.recipes.filter(r => !r.sample).length;
  const p = openLayer(head("שיתוף, גיבוי והגדרות") + `<div class="panel-b">
    <div><span class="status-pill${Store.ok ? " ok" : ""}">${Store.ok ? "נשמר בדפדפן הזה, במכשיר הזה" : "לא נשמר – שמרו גיבוי"}</span></div>
    <p class="hint" style="margin:0">המחברת שייכת רק לכם. מי שפותח את האפליקציה מקבל מחברת ריקה משלו, ושום דבר לא מסתנכרן ביניכם. כדאי לשמור קובץ גיבוי מדי פעם: ניקוי נתוני הדפדפן מוחק את המחברת, וגם כך מעבירים אותה למכשיר אחר.</p>
    <div class="opt-list">
      <button class="opt" type="button" data-act="shareAll"${n ? "" : " disabled"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg><div><b>שיתוף כל המחברת</b><span>${n} מתכונים · לשיתוף נושא אחד לחצו "שיתוף הנושא" ליד הכותרת שלו</span></div></button>
      <button class="opt" type="button" data-act="backup"${n ? "" : " disabled"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><div><b>שמירת גיבוי</b><span>קובץ עם כל המתכונים והתמונות</span></div></button>
      <button class="opt" type="button" data-act="import"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg><div><b>ייבוא קובץ</b><span>שחזור גיבוי או קובץ מתכונים שמישהו שלח לכם</span></div></button>
      <button class="opt" type="button" data-act="engine"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg><div><b>מנוע הסריקה</b><span>${Gemini.on ? "Gemini מחובר" : "סריקה בדפדפן · אפשר לחבר Gemini חינמי לכתב יד ולחיפוש באינטרנט"}</span></div></button>
    </div>
    <div><div class="lbl">הקטגוריות שלכם</div>
      ${customCats.length ? customCats.map(c => `<div class="catrow"><span class="badge" style="background:${c.color}">${esc(c.emoji || "🍴")} ${esc(c.name)}</span><span class="sp"></span><button class="btn ghost sm" type="button" data-delcat="${esc(c.id)}">מחיקה</button></div>`).join("") : `<p class="hint" style="margin:0 0 6px">אפשר להוסיף קטגוריות משלכם, כמו "אוכל לתינוק" או "ארוחות שישי".</p>`}
      <form id="catForm" style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="newCat" placeholder="שם קטגוריה חדשה"><button class="btn" type="submit">הוספה</button></form>
    </div>
  </div>`, {narrow: true});
  p.addEventListener("click", async e => {
    const d = e.target.closest("[data-delcat]");
    if (d) {
      const id = d.dataset.delcat;
      if (!d.classList.contains("armed")) { d.classList.add("armed", "danger"); d.textContent = "בטוח? המתכונים יעברו ל'אחר'"; return; }
      customCats = customCats.filter(c => c.id !== id); await meta.set("customCats", customCats);
      for (const r of S.recipes.filter(r => r.category === id)) { r.category = "other"; await saveRecipe(r, {quiet: true}); }
      if (S.cat === id) S.cat = "all"; render(); openMenu(); return;
    }
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "close") closeLayer();
    if (a.dataset.act === "shareAll") openShare({kind: "all"});
    if (a.dataset.act === "engine") openEngine(openMenu);
    if (a.dataset.act === "import") { const i = $("#fJson"); i.value = ""; i.click(); }
    if (a.dataset.act === "backup") {
      const b = await bundle(S.recipes.filter(r => !r.sample), true); const dt = new Date().toISOString().slice(0, 10);
      downloadFile(`גיבוי מחברת המתכונים ${dt}.json`, JSON.stringify(b)); toast("הגיבוי ירד למכשיר");
    }
  });
  $("#catForm", p).addEventListener("submit", async e => { e.preventDefault(); const v = $("#newCat", p).value.trim(); if (!v) return; await addCategory(v); render(); openMenu(); toast("הקטגוריה נוספה"); });
}

/* ---------- global events ---------- */
$("#chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  if (b.dataset.fav) S.fav = !S.fav;
  else if (b.dataset.c === "pesach") S.cat = S.cat === "pesach" ? "all" : "pesach";
  else if (!b.dataset.k) { S.k = ""; S.fav = false; }
  else S.k = S.k === b.dataset.k ? "" : b.dataset.k;
  render();
});
$("#tiles").addEventListener("click", e => {
  const t = e.target.closest(".tile"); if (!t) return;
  S.cat = S.cat === t.dataset.cat ? "all" : t.dataset.cat;
  render(); $("#list").scrollIntoView({behavior: "smooth", block: "start"});
});
$("#grid").addEventListener("click", e => { const c = e.target.closest("[data-open]"); if (c) openRecipe(c.dataset.open); });
$("#clear").addEventListener("click", () => { S.cat = "all"; S.k = ""; S.fav = false; S.q = ""; $("#q").value = ""; $("#searchBox").classList.remove("has"); render(); });
$("#shareCat").addEventListener("click", () => {
  if (S.cat === "pesach") openShare({kind: "list", ids: S.recipes.filter(r => r.pesach).map(r => r.id), title: "פסח"});
  else openShare({kind: "cat", cat: S.cat});
});
let qT;
$("#q").addEventListener("input", e => {
  $("#searchBox").classList.toggle("has", !!e.target.value);
  clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 150);
});
$("#qx").addEventListener("click", () => { $("#q").value = ""; $("#searchBox").classList.remove("has"); S.q = ""; render(); $("#q").focus(); });
$("#sort").addEventListener("change", e => { S.sort = e.target.value; render(); ls.set("rn-sort", S.sort); });
$("#bScan").addEventListener("click", openImporter);
$("#bNew").addEventListener("click", openNewMenu);
$("#bFind").addEventListener("click", () => openFinder("web"));
$("#bShare").addEventListener("click", () => openShare({kind: "all"}));
$("#bMenu").addEventListener("click", openMenu);
function routeHash() {
  const h = location.hash.slice(1); if (!h) return;
  if (h.startsWith("s=")) openSharedLink(h.slice(2));
  else if (S.recipes.some(r => r.id === h)) openRecipe(h);
}
window.addEventListener("hashchange", routeHash);

/* ---------- start ---------- */
async function start() {
  S.sort = ls.get("rn-sort", "new"); if (!["new", "az"].includes(S.sort)) S.sort = "new"; $("#sort").value = S.sort;
  await Store.open();
  customCats = (await meta.get("customCats", [])).map((c, i) => Object.assign({short: c.name, emoji: "🍴", color: CAT_COLORS[i % CAT_COLORS.length]}, c));
  S.recipes = (await Store.all("recipes")) || [];
  for (const r of S.recipes) if (OLD_CAT[r.category]) { r.category = OLD_CAT[r.category]; await Store.put("recipes", clone(r)); }
  render();
  if (await loadBuiltins()) render();
  routeHash();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
}
start();
})();
