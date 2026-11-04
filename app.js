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

/* ---------- categories ---------- */
const BASE_CATS = [
  {id:"starters", name:"מנות ראשונות", h:8},
  {id:"soups", name:"מרקים", h:28},
  {id:"salads", name:"סלטים", h:118},
  {id:"mains", name:"עיקריות", h:352},
  {id:"sides", name:"תוספות", h:42},
  {id:"breakfast", name:"ארוחות בוקר", h:52},
  {id:"baking", name:"מאפים ולחמים", h:24},
  {id:"cakes", name:"עוגות ועוגיות", h:330},
  {id:"desserts", name:"קינוחים", h:290},
  {id:"sauces", name:"רטבים וממרחים", h:88},
  {id:"drinks", name:"משקאות", h:192},
  {id:"other", name:"אחר", h:215},
];
let customCats = [];
const cats = () => [...BASE_CATS.slice(0, -1), ...customCats, BASE_CATS[BASE_CATS.length - 1]];
const catById = id => cats().find(c => c.id === id) || BASE_CATS[BASE_CATS.length - 1];
function catFromName(name) {
  const n = String(name || "").trim();
  const all = cats();
  return (all.find(c => c.name === n) || all.find(c => n && (c.name.includes(n) || n.includes(c.name))) || all.find(c => c.id === n) || catById("other")).id;
}
const catNames = () => cats().map(c => c.name).join(", ");

/* keyword sorting, used when there is no Gemini key */
const CAT_WORDS = {
  cakes: ["עוגה","עוגת","עוגות","עוגיות","עוגייה","עוגיה","בראוניז","מאפינס","קאפקייקס","טארט","רולדה","cake","cookie","brownie","muffin"],
  desserts: ["קינוח","מוס","פודינג","גלידה","פנקוטה","טירמיסו","סורבה","מלבי","קרם ברולה","פבלובה","dessert","mousse","pudding"],
  baking: ["לחם","חלה","חלות","פיתות","פיתה","בורקס","מאפה","מאפים","בצק עלים","פיצה","פוקאצ'ה","לחמניות","קיש","בייגל","שמרים","bread","pizza","quiche"],
  soups: ["מרק","soup"],
  salads: ["סלט","salad"],
  breakfast: ["שקשוקה","חביתה","פנקייק","פנקייקים","גרנולה","דייסה","טוסט","בלינצ'ס","לביבות","breakfast","pancake","omelet"],
  sauces: ["רוטב","ממרח","מטבל","טחינה","איולי","פסטו","ריבה","חומוס","מיונז","sauce","dip","spread","jam"],
  drinks: ["משקה","שייק","לימונדה","קוקטייל","סמוטי","ליקר","drink","smoothie","shake","lemonade"],
  sides: ["אורז","פתיתים","תפוחי אדמה","תפו\"א","קוסקוס","פירה","קינואה","בורגול","ירקות צלויים","מג'דרה","rice","potato","couscous"],
  mains: ["עוף","בשר","בקר","דג ","דגים","סלמון","קציצות","שניצל","תבשיל","צלי","הודו","פרגית","חזה","שוקיים","כרעיים","לזניה","פסטה","ממולאים","חמין","צ'ולנט","מוקפץ","אנטריקוט","chicken","beef","fish","salmon","pasta","stew"],
  starters: ["כבד קצוץ","חצילים","פטה","קרפצ'יו","טרטר","סביצ'ה","מנה ראשונה","סיגרים","appetizer","starter"],
};
function guessCat(title, text) {
  const T = (" " + String(title || "") + " ").toLowerCase(), X = (" " + String(text || "") + " ").toLowerCase();
  let best = "other", score = 0;
  for (const [id, words] of Object.entries(CAT_WORDS)) {
    let s = 0;
    for (const w of words) { if (T.includes(w)) s += 4; const m = X.split(w).length - 1; s += Math.min(m, 3); }
    if (s > score) { score = s; best = id; }
  }
  return best;
}
function guessTags(text) {
  const t = String(text || ""); const out = [];
  if (/חמאה|שמנת|גבינ|חלב(?!ון)|יוגורט|butter|cream|cheese|milk/i.test(t)) out.push("חלבי");
  else if (/עוף|בשר|בקר|הודו|פרגית|שוקיים|chicken|beef|meat/i.test(t)) out.push("בשרי");
  return out;
}

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
async function getImg(id) {
  if (!id) return null;
  if (imgCache.has(id)) return imgCache.get(id);
  const r = await Store.get("images", id);
  if (r) imgCache.set(id, r.data);
  return r ? r.data : null;
}
async function putImg(data, id = rid("i")) { imgCache.set(id, data); await Store.put("images", {id, data}); return id; }
async function delImg(id) { if (!id) return; imgCache.delete(id); await Store.del("images", id); }

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
const RECIPE_SHAPE = () => `{"title": string, "category": one of [${catNames()}], "servings": string or "", "time": string or "", "ingredients": [strings, one ingredient per line with its quantity as written; a sub-heading such as "לבצק" as "## לבצק"], "steps": [strings, one step each, no numbering; a sub-heading as "## ..."], "notes": string (tips, the writer's remarks, variations; "" if none), "tags": [up to 4 short Hebrew tags such as "פרווה","חלבי","בשרי","טבעוני","ללא גלוטן","חגים","מהיר"]}`;

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
  return {title, ingredients, steps: finalSteps, notes: notes.join("\n"), category: guessCat(title, raw), tags: guessTags(raw)};
}

function normRecipe(o, extra = {}) {
  const arr = v => Array.isArray(v) ? v.map(x => String(x ?? "").trim()).filter(Boolean) : String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
  const category = cats().some(c => c.id === o.category) ? o.category : catFromName(o.category);
  return Object.assign({
    id: rid(), title: String(o.title || "מתכון ללא שם").trim(), category,
    servings: String(o.servings || "").trim(), time: String(o.time || "").trim(),
    ingredients: arr(o.ingredients), steps: arr(o.steps), notes: String(o.notes || "").trim(),
    tags: arr(o.tags).slice(0, 6), photo: null, sourceImgs: [], source: {type: "manual"},
    fav: false, fresh: false, createdAt: now(), updatedAt: now(),
  }, extra);
}

/* ---------- app state ---------- */
const S = {recipes: [], cat: "all", fav: false, q: "", sort: "new"};

async function saveRecipe(r, {quiet} = {}) {
  r.updatedAt = now();
  const i = S.recipes.findIndex(x => x.id === r.id);
  if (i >= 0) S.recipes[i] = r; else S.recipes.push(r);
  await Store.put("recipes", clone(r));
  if (!r.sample) askPersist();
  if (!quiet) render();
}
async function deleteRecipe(id) {
  const r = S.recipes.find(x => x.id === id); if (!r) return;
  S.recipes = S.recipes.filter(x => x.id !== id);
  await Store.del("recipes", id);
  for (const im of [r.photo, ...(r.sourceImgs || [])].filter(Boolean)) {
    if (!S.recipes.some(o => o.photo === im || (o.sourceImgs || []).includes(im))) await delImg(im);
  }
  render();
}

/* ---------- example recipes for a first visit ---------- */
const SAMPLES = [
  {title:"שקשוקה של שבת בבוקר", category:"breakfast", servings:"4", time:"30 דקות", tags:["פרווה","מהיר"],
   ingredients:["3 כפות שמן זית","1 בצל בינוני קצוץ","1 פלפל אדום חתוך לרצועות","4 שיני שום פרוסות","6 עגבניות בשלות מגוררות","1 כף רסק עגבניות","1 כפית פפריקה מתוקה","½ כפית כמון","מלח ופלפל לפי הטעם","6 ביצים","פטרוזיליה קצוצה להגשה"],
   steps:["מחממים שמן במחבת רחבה ומטגנים את הבצל והפלפל עד שמתרככים, כ-8 דקות.","מוסיפים שום, פפריקה וכמון ומערבבים דקה.","מוסיפים עגבניות ורסק, מתבלים ומבשלים על אש בינונית 12 דקות עד שהרוטב מסמיך.","יוצרים גומות בכף ושוברים לתוכן את הביצים.","מכסים ומבשלים 5–7 דקות עד שהחלבון מתייצב והחלמון עדיין רך.","מפזרים פטרוזיליה ומגישים עם לחם טרי."],
   notes:"סבתא הוסיפה תמיד קורט סוכר לעגבניות חמוצות. מי שאוהב חריף – חצי פלפל חריף עם הבצל."},
  {title:"אורז לבן עם אטריות", category:"sides", servings:"6", time:"35 דקות", tags:["פרווה","טבעוני"],
   ingredients:["2 כוסות אורז פרסי","½ כוס אטריות דקות (פידאוס)","3 כפות שמן","3½ כוסות מים רותחים","1½ כפיות מלח"],
   steps:["שוטפים את האורז היטב ומסננים.","מחממים שמן בסיר ומשחימים את האטריות עד שהן זהובות.","מוסיפים את האורז ומערבבים דקה עד שכל הגרגרים מצופים בשמן.","מוסיפים מים ומלח, מביאים לרתיחה ומנמיכים לאש הקטנה ביותר.","מבשלים מכוסה 18 דקות, מכבים ומשאירים מכוסה עוד 10 דקות.","מפרידים במזלג לפני ההגשה."],
   notes:"לא לפתוח את המכסה בזמן הבישול!"},
  {title:"עוגת תפוזים בחושה", category:"cakes", servings:"תבנית 26 ס\"מ", time:"15 דקות הכנה + 45 אפייה", tags:["פרווה","בחושה"],
   ingredients:["## לעוגה","4 ביצים","1½ כוסות סוכר","1 כוס שמן","1 כוס מיץ תפוזים טבעי","גרידה מ-2 תפוזים","2½ כוסות קמח תופח","## לסירופ","½ כוס מיץ תפוזים","3 כפות סוכר"],
   steps:["מחממים תנור ל-170 מעלות ומשמנים תבנית.","טורפים ביצים וסוכר עד שהתערובת בהירה.","מוסיפים שמן, מיץ וגרידה וטורפים קלות.","מוסיפים את הקמח ומערבבים רק עד שאין גושים.","אופים כ-45 דקות עד שקיסם יוצא יבש.","מרתיחים מיץ וסוכר לסירופ ויוצקים על העוגה החמה."],
   notes:"נשמרת לחה 4 ימים בקופסה סגורה."},
];

/* ---------- rendering: library ---------- */
const cleanQ = s => s.toLowerCase().replace(/[֑-ׇ]/g, "").trim();
function visible() {
  let list = S.recipes.slice();
  if (S.fav) list = list.filter(r => r.fav);
  if (S.q) {
    const words = cleanQ(S.q).split(/\s+/).filter(Boolean);
    list = list.filter(r => {
      const hay = cleanQ([r.title, catById(r.category).name, ...(r.tags || []), ...(r.ingredients || []), r.notes].join(" "));
      return words.every(w => hay.includes(w));
    });
  }
  list.sort(S.sort === "az" ? (a, b) => a.title.localeCompare(b.title, "he") : (a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}
function plateLetter(t) { const m = String(t || "").match(/[\p{L}\p{N}]/u); return m ? m[0] : "•"; }
function cardHTML(r) {
  const c = catById(r.category);
  const metaTxt = [r.time, r.servings && ("מנות: " + r.servings)].filter(Boolean).map(esc).join(" · ");
  return `<button class="card" type="button" style="--h:${c.h}" data-open="${esc(r.id)}">
    <div class="thumb">${r.photo ? `<img alt="" data-img="${esc(r.photo)}">` : `<div class="plate"><span>${esc(plateLetter(r.title))}</span></div>`}
      <div class="badges">${r.sample ? `<span class="badge">דוגמה</span>` : ""}${r.fresh ? `<span class="badge new">חדש · לבדיקה</span>` : ""}${r.fav ? `<span class="badge star" aria-label="מועדף">★</span>` : ""}</div></div>
    <div class="card-b"><h3>${esc(r.title)}</h3><div class="meta">${S.cat === "all" && (S.q || S.fav) ? `<span>${esc(c.name)}</span>` : ""}${metaTxt ? `<span>${metaTxt}</span>` : ""}</div></div>
  </button>`;
}
function renderTabs() {
  const counts = {}; for (const r of S.recipes) counts[r.category] = (counts[r.category] || 0) + 1;
  const favN = S.recipes.filter(r => r.fav).length;
  let html = `<button type="button" class="tab all" data-cat="all" aria-pressed="${S.cat === "all" && !S.fav}">הכל <span class="n">${S.recipes.length}</span></button>`;
  if (favN) html += `<button type="button" class="tab fav" data-fav="1" aria-pressed="${S.fav}">★ מועדפים <span class="n">${favN}</span></button>`;
  for (const c of cats()) {
    const n = counts[c.id] || 0;
    html += `<button type="button" class="tab${n ? "" : " empty"}" style="--h:${c.h}" data-cat="${esc(c.id)}" aria-pressed="${S.cat === c.id}">${esc(c.name)} <span class="n">${n}</span></button>`;
  }
  $("#tabs").innerHTML = html;
}
function renderNotices() {
  const box = $("#notices"); let html = "";
  if (S.recipes.some(r => r.sample)) html += `<div class="notice"><p>אלה מתכוני דוגמה כדי לראות איך זה נראה. סרקו תיקיית תמונות או הוסיפו מתכון משלכם.</p><button class="btn sm" type="button" data-act="clearSamples">הסרת הדוגמאות</button></div>`;
  if (!Store.ok) html += `<div class="notice warn"><p>הדפדפן הזה לא מאפשר שמירה קבועה (אולי חלון גלישה פרטית). המתכונים יישמרו רק עד שתסגרו את הדף – שמרו גיבוי מהתפריט.</p></div>`;
  box.innerHTML = html;
}
function render() {
  renderTabs(); renderNotices();
  const n = S.recipes.filter(r => !r.sample).length;
  $("#countLine").textContent = n ? `${n} מתכונים במחברת` : "כל המתכונים שלכם במקום אחד";
  const list = visible(); const main = $("#main");
  if (!S.recipes.length) {
    main.innerHTML = `<div class="empty-state"><h2>המחברת ריקה</h2><p>התחילו בסריקת תיקייה של צילומים: האפליקציה תזהה מה מהן מתכונים, תקליד אותם ותמיין לקטגוריות.</p><p><button class="btn primary" type="button" data-act="scan">סריקת תמונות</button></p></div>`;
    return;
  }
  if (!list.length) { main.innerHTML = `<div class="empty-state"><h2>לא נמצא</h2><p>אין מתכון שמתאים לחיפוש. אפשר לחפש באינטרנט.</p><p><button class="btn" type="button" data-act="find">חיפוש מתכון</button></p></div>`; return; }
  let html = "";
  if (S.cat === "all" && !S.q && !S.fav) {
    for (const c of cats()) {
      const items = list.filter(r => r.category === c.id); if (!items.length) continue;
      html += `<section class="sec"><div class="sec-h" style="--h:${c.h}"><h2>${esc(c.name)}</h2><span class="n">${items.length}</span><span class="sp"></span><button class="btn ghost sm" type="button" data-share-cat="${esc(c.id)}">שיתוף הנושא</button></div><div class="grid">${items.map(cardHTML).join("")}</div></section>`;
    }
  } else {
    const items = S.cat === "all" ? list : list.filter(r => r.category === S.cat);
    const c = S.cat === "all" ? null : catById(S.cat);
    const title = S.q ? `תוצאות עבור "${esc(S.q)}"` : S.fav ? "מועדפים" : esc(c.name);
    html = `<section class="sec"><div class="sec-h" style="--h:${c ? c.h : 220}"><h2>${title}</h2><span class="n">${items.length}</span><span class="sp"></span>${c && items.length ? `<button class="btn ghost sm" type="button" data-share-cat="${esc(c.id)}">שיתוף הנושא</button>` : ""}</div>
      ${items.length ? `<div class="grid">${items.map(cardHTML).join("")}</div>` : `<p class="hint">עוד אין כאן מתכונים.</p>`}</section>`;
  }
  main.innerHTML = html;
  fillImgs(main);
}
function fillImgs(root) {
  $$("img[data-img]", root).forEach(async im => { const d = await getImg(im.dataset.img); if (d) im.src = d; else im.remove(); });
}

/* ---------- layers ---------- */
let layerOnClose = null;
function openLayer(html, {narrow, onClose} = {}) {
  const L = $("#layer");
  L.innerHTML = `<div class="panel${narrow ? " narrow" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  L.hidden = false; document.body.style.overflow = "hidden";
  layerOnClose = onClose || null;
  L.scrollTop = 0;
  const f = $("[autofocus]", L); if (f) f.focus();
  return $(".panel", L);
}
function closeLayer() {
  const L = $("#layer"); if (L.hidden) return;
  if (layerOnClose) { try { layerOnClose(); } catch {} layerOnClose = null; }
  L.hidden = true; L.innerHTML = ""; document.body.style.overflow = "";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}
$("#layer").addEventListener("mousedown", e => { if (e.target.id === "layer") closeLayer(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLayer(); });
const head = t => `<div class="panel-h"><h2>${t}</h2><button class="btn icon-btn ghost close" type="button" data-act="close" aria-label="סגירה"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
const dots = txt => `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span> ${txt}</div>`;

/* ---------- recipe view ---------- */
function linesHTML(lines, kind) {
  return lines.map((l, i) => {
    if (/^#{1,3}\s*/.test(l) || (/[:：]$/.test(l) && l.length < 40 && kind === "ing")) return `<li class="grp">${esc(l.replace(/^#{1,3}\s*/, "").replace(/[:：]$/, ""))}</li>`;
    return kind === "ing" ? `<li data-i="${i}"><span class="box" aria-hidden="true"></span><span>${esc(l)}</span></li>` : `<li>${esc(l)}</li>`;
  }).join("");
}
function sourceHTML(r) {
  const s = r.source || {};
  if (s.type === "image") return `מקור: צילום${s.label ? ` "${esc(s.label)}"` : ""}`;
  if (s.type === "web") return `מקור: ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || hostOf(s.url))}</a>` : esc(s.label || "אתר")}${s.alt ? ` · <a href="${esc(s.alt)}" target="_blank" rel="noopener">חיפוש באתר</a>` : ""}`;
  if (s.type === "claude" || s.type === "ai") return `מקור: הצעה של ${s.type === "claude" ? "Claude" : "Gemini"} מתוך ידע כללי`;
  if (s.type === "shared") return `מקור: שותף איתכם${s.label ? ` · ${esc(s.label)}` : ""}`;
  if (s.type === "sample") return "מתכון דוגמה";
  if (s.type === "text") return "מקור: טקסט שהודבק";
  return "נכתב ידנית";
}
function openRecipe(id) {
  const r = S.recipes.find(x => x.id === id); if (!r) return;
  const c = catById(r.category);
  const p = openLayer(`
    <div class="hero" style="--h:${c.h}">
      ${r.photo ? `<img alt="תמונת המנה" data-img="${esc(r.photo)}">` : `<div class="plate"><span>${esc(plateLetter(r.title))}</span></div>`}
      <button class="btn on-img icon-btn hero-close" type="button" data-act="close" aria-label="סגירה"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="hero-tools"><button class="btn on-img sm" type="button" data-act="photo">${r.photo ? "החלפת תמונת המנה" : "הוספת תמונה של המנה"}</button>${r.photo ? `<button class="btn on-img sm" type="button" data-act="nophoto">הסרה</button>` : ""}</div>
      ${r.photo && r.autoPhoto ? `<span class="badge" style="position:absolute;top:14px;right:14px">נלקחה מהתמונה שנסרקה</span>` : ""}
    </div>
    <div class="r-head">
      <div class="chips">
        <label class="chip" style="--h:${c.h};position:relative">${esc(c.name)} ▾
          <select data-act="setcat" aria-label="שינוי קטגוריה" style="position:absolute;inset:0;opacity:0;cursor:pointer">${cats().map(x => `<option value="${esc(x.id)}"${x.id === r.category ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        ${(r.tags || []).map(t => `<span class="chip plain">${esc(t)}</span>`).join("")}
        ${r.fresh ? `<span class="chip" style="--h:40">חדש · כדאי לבדוק מול המקור</span>` : ""}
      </div>
      <h2 class="r-title">${esc(r.title)}</h2>
      ${(r.time || r.servings) ? `<div class="facts">${r.time ? `<span>זמן: <b>${esc(r.time)}</b></span>` : ""}${r.servings ? `<span>כמות: <b>${esc(r.servings)}</b></span>` : ""}</div>` : ""}
      <div class="source">${sourceHTML(r)}${(r.sourceImgs || []).length ? `<button class="btn ghost sm" type="button" data-act="orig">הצגת התמונה המקורית</button>` : ""}</div>
      <div class="orig" id="orig" hidden>${(r.sourceImgs || []).map(i => `<img alt="התמונה המקורית של המתכון" data-img="${esc(i)}">`).join("")}</div>
    </div>
    <div class="r-body">
      <div><div class="lbl">מצרכים</div>${r.ingredients.length ? `<ul class="ing">${linesHTML(r.ingredients, "ing")}</ul>` : `<p class="hint">לא נרשמו מצרכים.</p>`}</div>
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div><div class="lbl">אופן ההכנה</div>${r.steps.length ? `<ol class="steps">${linesHTML(r.steps, "step")}</ol>` : `<p class="hint">לא נרשמו שלבים.</p>`}</div>
        ${r.notes ? `<div><div class="lbl">הערות</div><div class="note">${esc(r.notes)}</div></div>` : ""}
      </div>
    </div>
    <div class="r-actions">
      <button class="btn primary" type="button" data-act="edit">עריכה</button>
      <button class="btn" type="button" data-act="fav">${r.fav ? "★ במועדפים" : "☆ למועדפים"}</button>
      <button class="btn" type="button" data-act="share">שיתוף</button>
      ${r.fresh ? `<button class="btn" type="button" data-act="ok">בדקתי, הכל נכון</button>` : ""}
      <button class="btn danger" type="button" data-act="del">מחיקה</button>
    </div>`);
  if (location.hash !== "#" + r.id) history.replaceState(null, "", "#" + r.id);
  fillImgs(p);
  p.addEventListener("click", async e => {
    const li = e.target.closest(".ing li[data-i]"); if (li) { li.classList.toggle("done"); return; }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "close") closeLayer();
    else if (act === "orig") { const o = $("#orig", p); o.hidden = !o.hidden; a.textContent = o.hidden ? "הצגת התמונה המקורית" : "הסתרת התמונה המקורית"; }
    else if (act === "edit") openEditor(r);
    else if (act === "fav") { r.fav = !r.fav; await saveRecipe(r); openRecipe(r.id); }
    else if (act === "ok") { r.fresh = false; await saveRecipe(r); openRecipe(r.id); toast("מעולה, סומן כבדוק"); }
    else if (act === "share") openShare({kind: "recipe", ids: [r.id], title: r.title});
    else if (act === "photo") pickPhoto(async url => { const old = r.photo; r.photo = await putImg(url); r.autoPhoto = false; await saveRecipe(r); if (old) await delImg(old); openRecipe(r.id); toast("התמונה נוספה"); });
    else if (act === "nophoto") { const old = r.photo; r.photo = null; r.autoPhoto = false; await saveRecipe(r); if (old) await delImg(old); openRecipe(r.id); toast("התמונה הוסרה"); }
    else if (act === "del") {
      if (!a.classList.contains("armed")) { a.classList.add("armed"); a.textContent = "ללחוץ שוב כדי למחוק"; setTimeout(() => { if (a.isConnected) { a.classList.remove("armed"); a.textContent = "מחיקה"; } }, 3500); return; }
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
function catOptions(sel) { return cats().map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.name)}</option>`).join("") + `<option value="__new">+ קטגוריה חדשה…</option>`; }
function openEditor(r, {isNew} = {}) {
  const draft = clone(r);
  let newPhoto; // undefined = unchanged, null = removed, string = new data url
  const p = openLayer(head(isNew ? "מתכון חדש" : "עריכת מתכון") + `
    <form class="panel-b" id="edForm">
      <label class="field"><span>שם המתכון</span><input class="inp" id="edTitle" required value="${esc(isNew && draft.title === "מתכון ללא שם" ? "" : draft.title)}" placeholder="למשל: קציצות דגים של סבתא"${isNew ? " autofocus" : ""}></label>
      <div class="row2">
        <label class="field"><span>קטגוריה</span><select class="inp" id="edCat">${catOptions(draft.category)}</select></label>
        <label class="field"><span>זמן הכנה</span><input class="inp" id="edTime" value="${esc(draft.time)}" placeholder="40 דקות"></label>
        <label class="field"><span>כמות / מנות</span><input class="inp" id="edServ" value="${esc(draft.servings)}" placeholder="6 מנות"></label>
      </div>
      <label class="field" id="edNewCatWrap" hidden><span>שם הקטגוריה החדשה</span><input class="inp" id="edNewCat" placeholder="למשל: אוכל לפסח"></label>
      <label class="field"><span>מצרכים</span><small>מצרך בכל שורה. כותרת משנה: שורה שמתחילה ב-## (למשל ## לבצק)</small><textarea class="inp" id="edIng" rows="8">${esc(draft.ingredients.join("\n"))}</textarea></label>
      <label class="field"><span>אופן ההכנה</span><small>שלב בכל שורה, בלי מספרים – המספור אוטומטי</small><textarea class="inp" id="edSteps" rows="8">${esc(draft.steps.join("\n"))}</textarea></label>
      <label class="field"><span>הערות וטיפים</span><textarea class="inp" id="edNotes" rows="3">${esc(draft.notes)}</textarea></label>
      <div class="row2">
        <label class="field"><span>תגיות</span><small>מופרדות בפסיק</small><input class="inp" id="edTags" value="${esc((draft.tags || []).join(", "))}" placeholder="פרווה, חגים"></label>
        <label class="field"><span>קישור למקור (לא חובה)</span><input class="inp" id="edUrl" type="url" dir="ltr" value="${esc(draft.source && draft.source.url || "")}" placeholder="https://"></label>
      </div>
      <div class="field"><span>תמונה של המנה</span><div class="photo-pick" id="edPhotoBox"></div></div>
    </form>
    <div class="panel-f"><button class="btn primary" type="button" data-act="save">שמירה</button><button class="btn" type="button" data-act="close">ביטול</button></div>`);
  const box = $("#edPhotoBox", p);
  async function drawPhoto() {
    const cur = newPhoto === undefined ? await getImg(draft.photo) : newPhoto;
    box.innerHTML = (cur ? `<img alt="" src="${cur}">` : "") + `<button class="btn sm" type="button" data-act="ph">${cur ? "החלפה" : "בחירת תמונה"}</button>${cur ? `<button class="btn ghost sm" type="button" data-act="phx">הסרה</button>` : ""}`;
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
      const lines = v => v.split("\n").map(s => s.trim()).filter(Boolean);
      Object.assign(draft, {title, category: cat, time: $("#edTime", p).value.trim(), servings: $("#edServ", p).value.trim(),
        ingredients: lines($("#edIng", p).value), steps: lines($("#edSteps", p).value).map(s => s.replace(/^\d+[.)]\s*/, "")),
        notes: $("#edNotes", p).value.trim(), tags: $("#edTags", p).value.split(/[,،]/).map(s => s.trim()).filter(Boolean), fresh: false, sample: false});
      const url = $("#edUrl", p).value.trim();
      const src = Object.assign({type: "manual"}, draft.source);
      if (url) {
        if (["manual", "web", "text", "sample"].includes(src.type)) draft.source = {type: "web", url, label: hostOf(url)};
        else draft.source = Object.assign(src, {url});
      } else { delete src.url; delete src.alt; if (src.type === "web") src.type = "manual"; draft.source = src; }
      if (newPhoto !== undefined) { const old = draft.photo; draft.photo = newPhoto ? await putImg(newPhoto) : null; draft.autoPhoto = false; if (old) await delImg(old); }
      await saveRecipe(draft); toast("נשמר"); openRecipe(draft.id);
    }
  });
}
async function addCategory(name) {
  const ex = cats().find(c => c.name === name); if (ex) return ex.id;
  const used = cats().map(c => c.h); const palette = [160, 270, 5, 60, 210, 320, 100, 240];
  const c = {id: "c" + Math.random().toString(36).slice(2, 8), name, h: palette.find(h => !used.includes(h)) ?? Math.floor(Math.random() * 360)};
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
    if (a.dataset.act === "manual") openEditor(normRecipe({title: "", category: S.cat !== "all" ? S.cat : "other"}), {isNew: true});
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
        <div class="sugg">${SUGG.map(s => `<button type="button" class="chip plain" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
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
      return `<article class="res"><div class="chips"><span class="chip" style="--h:${c.h}">${esc(c.name)}</span>${r.time ? `<span class="chip plain">${esc(r.time)}</span>` : ""}</div>
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
Reply with only JSON, no other text: {"results":[{"title":"","sourceName":"the website's domain, e.g. foodish.co.il","category": one of [${catNames()}],"summary":"one sentence","servings":"","time":"","ingredients":["..."],"steps":["..."],"notes":""}]}`, {search: true, signal: Find.ctl.signal});
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
  L.push([c.name, r.servings && "כמות: " + r.servings, r.time && "זמן: " + r.time].filter(Boolean).join(" · "));
  if (r.ingredients.length) { L.push("", "*מצרכים*"); r.ingredients.forEach(x => L.push(/^#/.test(x) ? "_" + x.replace(/^#+\s*/, "") + "_" : "• " + x)); }
  if (r.steps.length) { L.push("", "*אופן ההכנה*"); let n = 0; r.steps.forEach(x => L.push(/^#/.test(x) ? "_" + x.replace(/^#+\s*/, "") + "_" : (++n) + ". " + x)); }
  if (r.notes) L.push("", "*הערות*", r.notes);
  const s = r.source || {}; if (s.url) L.push("", "מקור: " + s.url);
  return L.join("\n");
}
async function bundle(list, withImages) {
  const images = {};
  const recipes = list.map(r => { const o = clone(r); delete o.fresh; delete o.sample; return o; });
  if (withImages) for (const r of recipes) for (const id of [r.photo, ...(r.sourceImgs || [])].filter(Boolean)) { const d = await getImg(id); if (d) images[id] = d; }
  if (!withImages) recipes.forEach(r => { r.photo = null; r.sourceImgs = []; });
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
const slim = r => { const o = {t: r.title, c: catById(r.category).name, i: r.ingredients, s: r.steps}; if (r.servings) o.v = r.servings; if (r.time) o.m = r.time; if (r.notes) o.n = r.notes; if (r.tags && r.tags.length) o.g = r.tags; if (r.source && r.source.url) o.u = r.source.url; return o; };
const unslim = o => ({title: o.t, category: o.c, ingredients: o.i, steps: o.s, servings: o.v, time: o.m, notes: o.n, tags: o.g, url: o.u});
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
      await saveRecipe(normRecipe(it, {source}), {quiet: true});
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
      const r = normRecipe(o, {id: ex ? ex.id : (o.id || rid()), photo: o.photo ? imgMap[o.photo] || null : null,
        sourceImgs: (o.sourceImgs || []).map(i => imgMap[i]).filter(Boolean), source: o.source || {type: "shared"}, fav: !!o.fav, createdAt: o.createdAt || now()});
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
      ${customCats.length ? customCats.map(c => `<div class="catrow"><span class="chip" style="--h:${c.h}">${esc(c.name)}</span><span class="sp"></span><button class="btn ghost sm" type="button" data-delcat="${esc(c.id)}">מחיקה</button></div>`).join("") : `<p class="hint" style="margin:0 0 6px">אפשר להוסיף קטגוריות משלכם, כמו "פסח" או "אוכל לתינוק".</p>`}
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
$("#tabs").addEventListener("click", e => {
  const t = e.target.closest(".tab"); if (!t) return;
  if (t.dataset.fav) { S.fav = !S.fav; S.cat = "all"; } else { S.cat = t.dataset.cat; S.fav = false; }
  render(); window.scrollTo({top: 0});
});
$("#main").addEventListener("click", e => {
  const c = e.target.closest("[data-open]"); if (c) { openRecipe(c.dataset.open); return; }
  const sc = e.target.closest("[data-share-cat]"); if (sc) { openShare({kind: "cat", cat: sc.dataset.shareCat}); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  if (a.dataset.act === "scan") openImporter();
  if (a.dataset.act === "find") openFinder("web");
});
$("#notices").addEventListener("click", async e => {
  if (!e.target.closest("[data-act=clearSamples]")) return;
  for (const r of S.recipes.filter(r => r.sample)) await deleteRecipe(r.id);
  toast("הדוגמאות הוסרו");
});
let qT; $("#q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 150); });
$("#sort").addEventListener("change", e => { S.sort = e.target.value; render(); ls.set("rn-sort", S.sort); });
$("#bScan").addEventListener("click", openImporter);
$("#bNew").addEventListener("click", openNewMenu);
$("#bFind").addEventListener("click", () => openFinder("web"));
$("#bMenu").addEventListener("click", openMenu);
function routeHash() {
  const h = location.hash.slice(1); if (!h) return;
  if (h.startsWith("s=")) openSharedLink(h.slice(2));
  else if (S.recipes.some(r => r.id === h)) openRecipe(h);
}
window.addEventListener("hashchange", routeHash);

/* ---------- start ---------- */
async function start() {
  S.sort = ls.get("rn-sort", "new"); $("#sort").value = S.sort;
  await Store.open();
  customCats = await meta.get("customCats", []);
  S.recipes = (await Store.all("recipes")) || [];
  if (!(await meta.get("seeded", false)) && !S.recipes.length) {
    for (const o of SAMPLES) {
      const r = normRecipe(o, {sample: true, source: {type: "sample"}});
      S.recipes.push(r); await Store.put("recipes", clone(r));
    }
    await meta.set("seeded", true);
  }
  render();
  routeHash();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
}
start();
})();
