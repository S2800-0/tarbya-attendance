"use strict";
/* ====== إعدادات الكلية — عدّلها هنا ====== */
const CONFIG = {
  faculty: "كلية التربية",
  university: "جامعة المنوفية",
  years: ["1", "2", "3", "4"],     // الفرق الدراسية المتاحة
  qrRefreshMs: 5000,               // كل كم يتجدد رمز الطالب
  qrMaxAgeMs: 20000,               // أقصى عمر مقبول للرمز عند المسح
  idLockMs: 24 * 3600 * 1000,      // تغيير الرقم يُفعَّل بعد ٢٤ ساعة
  idGraceMs: 15 * 60 * 1000,       // تصحيح الرقم مجاني خلال ١٥ دقيقة من إنشاء البطاقة
  idChangedFlagMs: 7 * 24 * 3600 * 1000, // مدة ظهور تنبيه «تغيّر الرقم مؤخرًا»
};
/* ======================================== */

const $ = (id) => document.getElementById(id);
const icon = (name, cls = "ic sm") => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
const KEY = { profile: "tq.profile", device: "tq.device", askNote: "tq.askNote", sound: "tq.sound", iosHint: "tq.iosHint" };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
const clean = (s) => String(s || "").normalize("NFC").replace(/[\u0000-\u001f​-‏‪-‮]/g, "").replace(/\s+/g, " ").trim();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digits = (s) => NID.normalize(clean(s));
/** Arabic-Indic digits for display. Excel and QR keep Latin digits. */
const ar = (v) => String(v).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString("ar-EG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
const fmtDate = (iso) => new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
const pad2 = (n) => String(n).padStart(2, "0");
const fmtExcel = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const yearLabel = (y) => ({ 1: "الأولى", 2: "الثانية", 3: "الثالثة", 4: "الرابعة", 5: "الخامسة", 6: "السادسة", 7: "السابعة" })[y] || y;
const typeLabel = (k) => (k === "n" ? "الرقم القومي" : "الرقم الأكاديمي");
const typeShort = (k) => (k === "n" ? "قومي" : "أكاديمي");
/** Display form of an ID, isolated left-to-right so the dots stay before the digits inside Arabic text. */
const showId = (k, id) => "\u2066" + ar(k === "n" ? NID.mask(id) : id) + "\u2069";
const normName = (s) => clean(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "");

/* ---------- feedback ---------- */
let toastT;
function toast(msg, opts = {}) {
  const t = $("toast"), a = $("toastAction");
  $("toastText").textContent = msg;
  a.hidden = !opts.action;
  if (opts.action) { a.textContent = opts.action; a.onclick = () => { t.classList.remove("show"); opts.onAction(); }; }
  t.classList.add("show");
  clearTimeout(toastT);
  if (!opts.persist) toastT = setTimeout(() => t.classList.remove("show"), opts.action ? 6000 : 3500);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

let audio = null;
function unlockAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
}
function beep(kind) {
  if (Store.get(KEY.sound) === false || !audio) return;
  try {
    const tones = kind === "ok" ? [[880, 0, 0.12]] : [[330, 0, 0.13], [330, 0.18, 0.13]];
    for (const [f, at, len] of tones) {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + at;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + len + 0.02);
    }
  } catch {}
}

function confirmBox(title, text, yesLabel = "تأكيد", danger = false) {
  return new Promise((res) => {
    $("cTitle").textContent = title; $("cText").textContent = text; $("cYes").textContent = yesLabel;
    $("cYes").className = "btn " + (danger ? "danger" : "primary");
    const d = $("dlgConfirm"); d.showModal();
    $("cYes").onclick = () => { d.close(); res(true); };
    $("cNo").onclick = () => { d.close(); res(false); };
    d.oncancel = () => res(false);
  });
}
function promptBox(title, value) {
  return new Promise((res) => {
    const d = $("dlgPrompt");
    $("pTitle").textContent = title; $("pLabel").textContent = title; $("pInput").value = value || "";
    d.showModal(); $("pInput").select();
    $("promptForm").onsubmit = (e) => { e.preventDefault(); const v = clean($("pInput").value); if (!v) return; d.close(); res(v); };
    $("pCancel").onclick = () => { d.close(); res(null); };
    d.oncancel = () => res(null);
  });
}

/** Shows an error under a field, marks it invalid, and returns whether it had one. */
function fieldError(inputId, errId, msg) {
  $(errId).textContent = msg || "";
  const input = inputId && $(inputId);
  if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  return !!msg;
}

/* ---------- branding & device ---------- */
$("facultyName").textContent = CONFIG.faculty;
$("cardFaculty").textContent = CONFIG.faculty;
$("universityName").textContent = CONFIG.university || "نظام تسجيل الحضور";
$("cardUni").textContent = CONFIG.university;
document.title = "تسجيل الحضور · " + CONFIG.faculty;

let deviceId = Store.get(KEY.device);
if (!deviceId) { deviceId = uuid(); Store.set(KEY.device, deviceId); }
$("devShort").textContent = deviceId.slice(0, 4).toUpperCase() + "·" + deviceId.slice(-4).toUpperCase();

/* ---------- top tabs ---------- */
function showTab(which) {
  $("tabStudent").setAttribute("aria-selected", which === "student");
  $("tabStaff").setAttribute("aria-selected", which === "staff");
  $("seg").dataset.pos = which === "staff" ? "1" : "0";
  $("studentView").hidden = which !== "student";
  $("staffView").hidden = which !== "staff";
  if (which !== "staff") stopCamera();
  if (which === "staff") renderStaff();
  try { history.replaceState(null, "", which === "staff" ? "#staff" : location.pathname); } catch {}
  window.scrollTo(0, 0);
}
$("tabStudent").onclick = () => showTab("student");
$("tabStaff").onclick = () => showTab("staff");

/* =====================================================================
   STUDENT
   ===================================================================== */
$("years").innerHTML = CONFIG.years.map((y) => `<label><input type="radio" name="year" value="${y}"><span>${yearLabel(y)}</span></label>`).join("");

/** Old v1 profiles ({name,id,year}) become academic-number cards. */
function loadProfile() {
  const p = Store.get(KEY.profile);
  if (!p) return null;
  if (!p.idType) { p.idType = "a"; p.createdAt = p.createdAt || 0; Store.set(KEY.profile, p); }
  if (p.pending && Date.now() >= p.pending.applyAt) {
    p.idType = p.pending.idType; p.id = p.pending.id; p.idChangedAt = p.pending.applyAt;
    delete p.pending;
    Store.set(KEY.profile, p);
  }
  return p;
}

function currentIdType(prefix = "") {
  return (document.querySelector(`input[name=${prefix || "idType"}]:checked`) || {}).value || "n";
}

function validateId(k, id) {
  if (k === "n") { const r = NID.parse(id); return r.ok ? "" : r.error; }
  return /^\d{2,20}$/.test(id) ? "" : "الرقم الأكاديمي يتكون من أرقام فقط.";
}
function validateName(name) {
  if (name.length < 5 || !/\p{L}/u.test(name)) return "اكتب الاسم بالكامل.";
  if (name.split(" ").length < 2) return "اكتب الاسم ثنائيًا على الأقل.";
  return "";
}

function syncIdField() {
  const k = currentIdType();
  $("fIdLabel").textContent = typeLabel(k);
  $("fId").placeholder = k === "n" ? "١٤ رقمًا" : "مثال: ٢٠٢٤١٢٣";
  $("fId").maxLength = k === "n" ? 20 : 24;
  updateIdHint();
}
function updateIdHint() {
  const k = currentIdType(), id = digits($("fId").value);
  const h = $("idHint");
  h.className = "hint";
  if (k === "a") { h.textContent = "كما هو مكتوب في كارنيه الكلية."; return; }
  if (id.length === 14) {
    const r = NID.parse(id);
    if (r.ok) {
      h.className = "hint ok";
      h.textContent = `تاريخ الميلاد ${r.birthDate.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · ${r.governorate}`;
      return;
    }
  }
  h.textContent = `١٤ رقمًا كما في بطاقة الرقم القومي.${id ? ` (${ar(id.length)} من ١٤)` : ""}`;
}
document.querySelectorAll("input[name=idType]").forEach((r) => (r.onchange = () => { syncIdField(); fieldError("fId", "eId", ""); }));
$("fId").addEventListener("input", updateIdHint);
$("fId").addEventListener("blur", () => { const id = digits($("fId").value); if (id) fieldError("fId", "eId", validateId(currentIdType(), id)); });

$("studentForm").onsubmit = (ev) => {
  ev.preventDefault();
  const name = clean($("fName").value), idType = currentIdType(), id = digits($("fId").value);
  const year = (document.querySelector("input[name=year]:checked") || {}).value || "";
  const errs = [
    fieldError("fName", "eName", validateName(name)) && "fName",
    fieldError("fId", "eId", validateId(idType, id)) && "fId",
    fieldError(null, "eYear", CONFIG.years.includes(year) ? "" : "اختر الفرقة.") && "years",
  ].filter(Boolean);
  if (errs.length) {
    const first = errs[0] === "years" ? document.querySelector("input[name=year]") : $(errs[0]);
    first && first.focus();
    return;
  }

  const prev = loadProfile();
  const now = Date.now();
  if (!prev) {
    Store.set(KEY.profile, { name, idType, id, year, createdAt: now, freeSwitchUsed: idType === "n" });
    renderStudent();
    return;
  }
  const p = { ...prev, name, year };
  const changed = prev.idType !== idType || prev.id !== id;
  if (changed) {
    const samePending = prev.pending && prev.pending.idType === idType && prev.pending.id === id;
    const inGrace = prev.createdAt && now - prev.createdAt < CONFIG.idGraceMs && !prev.idChangedAt;
    const freeSwitch = prev.idType === "a" && idType === "n" && !prev.freeSwitchUsed;
    if (samePending) {
      // nothing new
    } else if (inGrace || freeSwitch) {
      p.idType = idType; p.id = id; delete p.pending;
      if (freeSwitch) p.freeSwitchUsed = true;
      toast(freeSwitch ? "تم التحويل إلى الرقم القومي." : "تم تصحيح الرقم.");
    } else {
      p.pending = { idType, id, applyAt: now + CONFIG.idLockMs };
      toast("سيتم تفعيل الرقم الجديد بعد ٢٤ ساعة. البطاقة تعمل بالرقم الحالي حتى ذلك الحين.");
    }
  }
  Store.set(KEY.profile, p);
  renderStudent();
};
$("editBtn").onclick = () => renderStudent(true);
$("cancelEdit").onclick = () => renderStudent();
$("cancelPending").onclick = async () => {
  if (!(await confirmBox("إلغاء تغيير الرقم؟", "ستستمر البطاقة بالرقم الحالي.", "إلغاء التغيير"))) return;
  const p = loadProfile(); if (p) { delete p.pending; Store.set(KEY.profile, p); }
  renderStudent();
};

let qrTimer, countT, nextAt = 0, revealT;
function renderStudent(edit = false) {
  const p = loadProfile();
  clearInterval(qrTimer); clearInterval(countT);
  if (!p || edit) {
    $("studentForm").hidden = false; $("passView").hidden = true;
    $("cancelEdit").hidden = !p;
    ["fName", "fId"].forEach((i) => $(i).setAttribute("aria-invalid", "false"));
    ["eName", "eId", "eYear"].forEach((i) => ($(i).textContent = ""));
    if (p) {
      $("fName").value = p.name; $("fId").value = p.id;
      document.querySelector(`input[name=idType][value="${p.idType}"]`).checked = true;
      const r = document.querySelector(`input[name=year][value="${p.year}"]`); if (r) r.checked = true;
    }
    syncIdField();
    return;
  }
  $("studentForm").hidden = true; $("passView").hidden = false;
  $("pName").textContent = p.name; $("pYear").textContent = yearLabel(p.year);
  $("pIdLabel").textContent = typeLabel(p.idType);
  const masked = p.idType === "n";
  const paintId = () => {
    if (!masked) { $("pId").textContent = ar(p.id); return; }
    $("pId").innerHTML = `<span class="dots">${"•".repeat(10)}</span> ${ar(p.id.slice(-4))}`;
  };
  paintId();
  $("revealBtn").hidden = !masked;
  $("revealBtn").onclick = () => {
    clearTimeout(revealT);
    $("pId").textContent = ar(p.id);
    revealT = setTimeout(paintId, 5000);
  };
  $("pendingBox").hidden = !p.pending; $("cancelPending").hidden = !p.pending;
  if (p.pending) {
    const at = new Date(p.pending.applyAt);
    $("pendingText").textContent = `سيتم تفعيل ${typeLabel(p.pending.idType)} الجديد (${showId(p.pending.idType, p.pending.id)}) ${at.toLocaleString("ar-EG", { weekday: "long", hour: "numeric", minute: "2-digit" })}.`;
  }
  maybeShowIosHint();

  const draw = () => {
    const cur = loadProfile();
    const payload = { v: 2, t: "tarbya-att", n: cur.name, k: cur.idType, i: cur.id, y: cur.year, d: deviceId, ts: Date.now() };
    if (cur.idChangedAt) payload.c = cur.idChangedAt;
    drawQR($("qr"), JSON.stringify(payload));
    nextAt = Date.now() + CONFIG.qrRefreshMs;
    const bar = $("timerBar");
    bar.style.transition = "none"; bar.style.width = "100%";
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${CONFIG.qrRefreshMs}ms linear`; bar.style.width = "0%"; }));
  };
  const tick = () => { const s = Math.max(1, Math.ceil((nextAt - Date.now()) / 1000)); $("timerText").textContent = `${ar(s)} ث`; };
  draw(); tick();
  qrTimer = setInterval(draw, CONFIG.qrRefreshMs); countT = setInterval(tick, 250);
}
function drawQR(canvas, text) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const q = qrcode(0, "M"); q.addData(text, "Byte"); q.make();
  const n = q.getModuleCount(), quiet = 2, scale = Math.max(4, Math.floor(600 / (n + quiet * 2)));
  const size = (n + quiet * 2) * scale; canvas.width = size; canvas.height = size;
  const c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); c.fillStyle = "#14152b";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + quiet) * scale, (r + quiet) * scale, scale, scale);
}

/* =====================================================================
   STAFF — state
   ===================================================================== */
let session = null;      // the open session
let rosters = [];        // all saved class lists
let pastSessions = [];   // closed sessions
let rosterIdx = null;    // { roster, nid: Map, acad: Map } for the open session
let staffPane = "session";

const rosterById = (id) => rosters.find((r) => r.id === id) || null;

function buildRosterIndex(roster) {
  if (!roster) return null;
  const nid = new Map(), acad = new Map();
  for (const row of roster.rows) {
    if (row.nid) nid.set(row.nid, row);
    if (row.acad) acad.set(row.acad, row);
  }
  return { roster, nid, acad };
}
function matchRoster(idx, k, id) {
  if (!idx) return null;
  return (k === "n" ? idx.nid : idx.acad).get(id) || null;
}

async function saveSession(s = session) {
  if (!s) return;
  s.updatedAt = new Date().toISOString();
  try { await DB.put("sessions", s); } catch { toast("تعذّر حفظ الجلسة على الهاتف. نزّل ملف Excel الآن احتياطًا."); }
}

async function loadStaffData() {
  await migrateV1();
  const all = await DB.all("sessions");
  session = all.find((s) => s.open) || null;
  pastSessions = all.filter((s) => !s.open).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  rosters = (await DB.all("rosters")).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  rosterIdx = session ? buildRosterIndex(rosterById(session.rosterId)) : null;
}

/* ---------- staff sub-tabs ---------- */
function showStaffPane(which) {
  staffPane = which;
  for (const [tab, pane, key] of [["stTabSession", "paneSession", "session"], ["stTabHistory", "paneHistory", "history"], ["stTabLists", "paneLists", "lists"]]) {
    $(tab).setAttribute("aria-selected", which === key);
    $(pane).hidden = which !== key;
  }
  if (which !== "session") stopCamera();
  renderStaff();
}
$("stTabSession").onclick = () => showStaffPane("session");
$("stTabHistory").onclick = () => showStaffPane("history");
$("stTabLists").onclick = () => showStaffPane("lists");

function renderBadges() {
  $("historyBadge").hidden = !pastSessions.length; $("historyBadge").textContent = ar(pastSessions.length);
  $("listsBadge").hidden = !rosters.length; $("listsBadge").textContent = ar(rosters.length);
}

function renderStaff() {
  renderBadges();
  if (staffPane === "history") return renderHistory();
  if (staffPane === "lists") return renderRosters();
  const live = !!session;
  $("setup").hidden = live; $("live").hidden = !live;
  if (!live) return renderSetup();
  $("liveName").textContent = session.name;
  $("liveDate").textContent = fmtDateTime(session.createdAt);
  const r = rosterIdx && rosterIdx.roster;
  $("liveRoster").hidden = !r;
  if (r) $("liveRoster").querySelector("span").textContent = `${r.name} · ${ar(r.rows.length)} طالب`;
  if (!$("fileName").dataset.touched) $("fileName").value = defaultFileName(session);
  $("exportHint").textContent = r
    ? "الملف فيه ورقة الحضور، وورقة الغياب، وورقة لمن ليسوا في القائمة إن وُجدوا."
    : "الأعمدة: م · الاسم · رقم الهوية · النوع · الفرقة · وقت التسجيل · ملاحظات";
  renderList();
}

function renderSetup() {
  const sel = $("sRoster");
  const prev = sel.value;
  sel.innerHTML = `<option value="">بدون قائمة</option>` +
    rosters.map((r) => `<option value="${r.id}">${esc(r.name)} (${ar(r.rows.length)})</option>`).join("");
  if (rosters.some((r) => r.id === prev)) sel.value = prev;
  $("sRosterHint").textContent = rosters.length
    ? "عند اختيار قائمة، يظهر الغائبون في ملف Excel."
    : "لا توجد قوائم بعد. يمكنك استيرادها من تبويب «القوائم».";
}

/* ---------- start / finish ---------- */
$("startBtn").onclick = async () => {
  const name = clean($("sName").value);
  if (fieldError("sName", "eSession", name ? "" : "اكتب اسم الجلسة.")) { $("sName").focus(); return; }
  unlockAudio();
  const rosterId = $("sRoster").value || null;
  session = { id: uuid(), name, createdAt: new Date().toISOString(), records: [], dupScans: 0, open: true, rosterId };
  rosterIdx = buildRosterIndex(rosterById(rosterId));
  delete $("fileName").dataset.touched;
  $("last").className = "banner";
  await saveSession(); renderStaff(); startCamera();
};
$("finishBtn").onclick = async () => {
  const ok = await confirmBox("إنهاء الجلسة؟", "ستُحفظ الجلسة في «السجل» ويمكنك تنزيل ملف Excel منها في أي وقت.", "إنهاء وحفظ");
  if (!ok) return;
  stopCamera();
  session.open = false; session.endedAt = new Date().toISOString();
  await saveSession();
  pastSessions.unshift(session);
  session = null; rosterIdx = null; $("sName").value = "";
  renderStaff(); toast("تم حفظ الجلسة في السجل.");
};

/* ---------- live list ---------- */
function sharedDevices(s) {
  const m = new Map();
  for (const r of s.records) { if (!r.device) continue; m.set(r.device, (m.get(r.device) || 0) + 1); }
  return new Set([...m].filter(([, c]) => c > 1).map(([d]) => d));
}
/** All warning flags for a record, as Arabic labels. */
function recordFlags(r, s, shared, hasRoster) {
  const out = [];
  if (r.device && shared.has(r.device)) out.push("نفس الهاتف");
  if ((r.flags || []).includes("idChanged")) out.push("تغيّر الرقم مؤخرًا");
  if ((r.flags || []).includes("sameName")) out.push("اسم مطابق برقم مختلف");
  if (hasRoster && !r.rosterRowId) out.push("غير موجود في القائمة");
  return out;
}
function absentRows(s, idx) {
  if (!idx) return [];
  const seen = new Set(s.records.map((r) => r.rosterRowId).filter(Boolean));
  return idx.roster.rows.filter((row) => !seen.has(row.rid));
}

let newestKey = null;
function renderList() {
  const s = session, recs = s.records, shared = sharedDevices(s), hasRoster = !!rosterIdx;
  const flagged = recs.filter((r) => recordFlags(r, s, shared, hasRoster).length).length;
  $("stTotal").textContent = ar(recs.length); $("listCount").textContent = ar(recs.length);
  $("stAbsentBox").hidden = !hasRoster;
  if (hasRoster) $("stAbsent").textContent = ar(absentRows(s, rosterIdx).length);
  $("stFlag").textContent = ar(flagged); $("stFlagBox").classList.toggle("alert", flagged > 0);
  $("stDup").textContent = ar(s.dupScans); $("stDupBox").classList.toggle("alert", s.dupScans > 0);
  if (!recs.length) {
    $("list").innerHTML = `<li class="empty" style="display:block;border:0">${icon("users", "ic")}لم يُسجَّل أي طالب بعد.<br>شغّل الكاميرا وابدأ المسح.</li>`;
    return;
  }
  $("list").innerHTML = recs.map((r, i) => {
    const flags = recordFlags(r, s, shared, hasRoster);
    return `<li${r.key === newestKey ? ' class="new"' : ""}>
    <span class="idx">${ar(i + 1)}</span>
    <div class="who"><b>${esc(r.name)}</b>
      <div class="meta"><span class="num">${esc(showId(r.idType, r.id))}</span><span>${typeShort(r.idType)}</span><span>الفرقة ${esc(yearLabel(r.year))}</span><span>${fmtTime(r.at)}</span>
        ${flags.map((f) => `<span class="chip">${f}</span>`).join("")}${r.manual ? '<span class="chip info">يدوي</span>' : ""}</div>
      ${r.note ? `<div class="memo">${icon("note")}<span>${esc(r.note)}</span></div>` : ""}</div>
    <div class="acts"><button class="icon-btn" data-edit="${r.key}" aria-label="تعديل ${esc(r.name)}">${icon("edit")}</button><button class="icon-btn del" data-del="${r.key}" aria-label="حذف ${esc(r.name)}">${icon("trash")}</button></div>
  </li>`;
  }).reverse().join("");
  newestKey = null;
}
$("list").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.edit) openRecord(session.records.find((r) => r.key === b.dataset.edit));
  if (b.dataset.del) {
    const r = session.records.find((x) => x.key === b.dataset.del);
    if (!(await confirmBox("حذف هذا الطالب من الجلسة؟", `${r.name} · ${showId(r.idType, r.id)}`, "حذف", true))) return;
    const at = session.records.indexOf(r);
    session.records.splice(at, 1); await saveSession(); renderList();
    toast(`تم حذف ${r.name}.`, { action: "تراجع", onAction: async () => { session.records.splice(at, 0, r); await saveSession(); renderList(); } });
  }
};

/* ---------- record edit / manual add ---------- */
let editing = null;
function openRecord(r) {
  editing = r || null;
  $("rTitle").textContent = r ? "تعديل السجل" : "إضافة طالب يدويًا";
  $("rName").value = r ? r.name : ""; $("rId").value = r ? r.id : ""; $("rYear").value = r ? r.year : "";
  $("rNote").value = r ? r.note || "" : ""; $("rErr").textContent = "";
  document.querySelector(`input[name=rType][value="${r ? r.idType : "n"}"]`).checked = true;
  $("dlgRecord").showModal();
}
$("addManual").onclick = () => openRecord(null);
$("rCancel").onclick = () => $("dlgRecord").close();
$("recForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const name = clean($("rName").value), idType = currentIdType("rType"), id = digits($("rId").value);
  const year = digits($("rYear").value), note = clean($("rNote").value).slice(0, 200);
  const msg = validateName(name) || validateId(idType, id) || (CONFIG.years.includes(year) ? "" : `الفرقة من ${ar(CONFIG.years[0])} إلى ${ar(CONFIG.years.at(-1))}.`);
  if (msg) { $("rErr").textContent = msg; return; }
  const other = session.records.find((x) => x.idType === idType && x.id === id && x !== editing);
  if (other) { $("rErr").textContent = `هذا الرقم مسجّل بالفعل باسم ${other.name}.`; return; }
  const row = matchRoster(rosterIdx, idType, id);
  if (editing) Object.assign(editing, { name, idType, id, year, note, rosterRowId: row ? row.rid : null });
  else {
    const rec = { key: uuid(), name, idType, id, year, note, device: "", at: new Date().toISOString(), manual: true, flags: [], rosterRowId: row ? row.rid : null };
    session.records.push(rec); newestKey = rec.key;
  }
  await saveSession(); renderList(); $("dlgRecord").close();
};

/* ---------- note after scan ---------- */
let noteFor = null;
function askNoteFor(r) { noteFor = r; $("nWho").textContent = `${r.name} · ${showId(r.idType, r.id)}`; $("nText").value = r.note || ""; $("dlgNote").showModal(); }
$("nSkip").onclick = () => $("dlgNote").close();
$("noteForm").onsubmit = async (ev) => { ev.preventDefault(); if (noteFor) { noteFor.note = clean($("nText").value).slice(0, 200); await saveSession(); renderList(); } $("dlgNote").close(); };
$("dlgNote").addEventListener("close", () => { noteFor = null; paused = false; });

/* ---------- camera + scanning ---------- */
let stream = null, facing = "environment", raf = 0, paused = false, lastSeen = { text: "", at: 0 }, wakeLock = null;
const work = document.createElement("canvas"), wctx = work.getContext("2d", { willReadFrequently: true });

async function startCamera() {
  if (stream) return;
  unlockAudio();
  if (!window.isSecureContext) { $("camMsg").textContent = "الكاميرا تحتاج رابطًا آمنًا (https). افتح التطبيق من رابطه على الإنترنت."; return; }
  if (!navigator.mediaDevices?.getUserMedia) { $("camMsg").textContent = "هذا المتصفح لا يدعم الكاميرا. استخدم Chrome أو Safari."; return; }
  $("camMsg").textContent = "جارٍ تشغيل الكاميرا…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (err) {
    stream = null;
    $("camMsg").textContent = err && err.name === "NotAllowedError"
      ? "تم رفض إذن الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم اضغط «تشغيل الكاميرا»."
      : "تعذّر تشغيل الكاميرا. أغلق أي تطبيق آخر يستخدمها وحاول مرة أخرى.";
    return;
  }
  const v = $("video"); v.srcObject = stream; await v.play().catch(() => {});
  $("scanOff").hidden = true; $("flipBtn").hidden = false; $("stopBtn").hidden = false; $("scanPill").hidden = false;
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  loop();
}
function stopCamera() {
  cancelAnimationFrame(raf); raf = 0;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  const v = $("video"); if (v) v.srcObject = null;
  $("scanOff").hidden = false; $("flipBtn").hidden = true; $("stopBtn").hidden = true; $("scanPill").hidden = true;
  $("camMsg").textContent = "وجّه الكاميرا نحو بطاقة الطالب داخل الإطار.";
  try { wakeLock?.release(); } catch {} wakeLock = null;
}
$("camBtn").onclick = startCamera;
$("stopBtn").onclick = stopCamera;
$("flipBtn").onclick = () => { facing = facing === "environment" ? "user" : "environment"; stopCamera(); startCamera(); };
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && stream && !wakeLock) { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {} }
});

let lastTick = 0;
function loop(t = 0) {
  raf = requestAnimationFrame(loop);
  if (paused || t - lastTick < 120) return; lastTick = t;
  const v = $("video"); if (!v.videoWidth) return;
  const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
  work.width = Math.round(v.videoWidth * s); work.height = Math.round(v.videoHeight * s);
  wctx.drawImage(v, 0, 0, work.width, work.height);
  const img = wctx.getImageData(0, 0, work.width, work.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
  if (!code) return;
  let text; try { text = new TextDecoder("utf-8").decode(new Uint8Array(code.binaryData)); } catch { text = code.data; }
  const now = Date.now();
  if (text === lastSeen.text && now - lastSeen.at < 3000) return;
  lastSeen = { text, at: now };
  handleScan(text, now);
}

let flashT;
function flash(kind, title, text) {
  const f = $("flash");
  f.className = "flash " + kind;
  $("flashIcon").setAttribute("href", kind === "ok" ? "#i-check" : "#i-alert");
  $("flashTitle").textContent = title; $("flashText").textContent = text || "";
  void f.offsetWidth; f.classList.add("show");
  clearTimeout(flashT); flashT = setTimeout(() => f.classList.remove("show"), 1200);
}
function showLast(kind, msg) {
  const l = $("last"); l.className = "banner " + kind;
  l.innerHTML = icon(kind === "ok" ? "check" : "alert", "ic") + `<span>${esc(msg)}</span>`;
}
function reject(title, msg) { flash("warn", title, msg); vibrate([40, 60, 40]); beep("warn"); showLast("warn", `${title}. ${msg}`); }

/** Accepts v1 cards (academic number) and v2 cards. */
function parsePayload(text) {
  let p; try { p = JSON.parse(text); } catch { return null; }
  if (!p || p.t !== "tarbya-att" || typeof p.n !== "string") return null;
  const k = p.v === 1 ? "a" : p.v === 2 && (p.k === "n" || p.k === "a") ? p.k : null;
  if (!k) return null;
  const id = String(p.i || "");
  if (k === "n" ? !/^\d{14}$/.test(id) : !/^\d{2,20}$/.test(id)) return null;
  if (!CONFIG.years.includes(p.y)) return null;
  return { name: clean(p.n).slice(0, 80), k, id, year: p.y, device: String(p.d || "").slice(0, 64), ts: Number(p.ts) || 0, changedAt: Number(p.c) || 0 };
}

async function handleScan(text, now) {
  const p = parsePayload(text);
  if (!p) return reject("رمز غير صالح", "هذا ليس رمز حضور من التطبيق.");
  const age = now - p.ts;
  if (age > CONFIG.qrMaxAgeMs) return reject("رمز قديم", `رمز ${p.name} قديم (صورة أو لقطة شاشة؟). اطلب منه عرض البطاقة الحية على هاتفه.`);
  if (age < -300000) return reject("ساعة الهاتف غير مضبوطة", "اطلب من الطالب ضبط الوقت والتاريخ على هاتفه.");

  const dup = session.records.find((r) => r.idType === p.k && r.id === p.id);
  if (dup) {
    session.dupScans++; await saveSession(); renderList();
    flash("warn", "مسجّل بالفعل", `${dup.name} · ${fmtTime(dup.at)}`); vibrate([22, 60, 22]); beep("warn");
    showLast("warn", `${dup.name} مسجّل بالفعل الساعة ${fmtTime(dup.at)}.`);
    return;
  }

  const flags = [];
  if (p.changedAt && now - p.changedAt < CONFIG.idChangedFlagMs) flags.push("idChanged");
  const nn = normName(p.name);
  if (session.records.some((r) => normName(r.name) === nn)) flags.push("sameName");
  const row = matchRoster(rosterIdx, p.k, p.id);
  const rec = { key: uuid(), name: p.name, idType: p.k, id: p.id, year: p.year, device: p.device, at: new Date().toISOString(), note: "", manual: false, flags, rosterRowId: row ? row.rid : null };

  const sameDev = rec.device && session.records.filter((r) => r.device === rec.device);
  if (sameDev && sameDev.length) {
    paused = true; vibrate([22, 60, 22]); beep("warn");
    const ok = await confirmBox("نفس الهاتف لطالب آخر",
      `رمز ${rec.name} جاء من نفس الهاتف الذي سُجّل منه: ${sameDev.map((r) => r.name).join("، ")}. قد يكون طالب يسجّل لزميله. هل تريد تسجيله رغم ذلك؟`, "تسجيل مع تنبيه");
    paused = false;
    if (!ok) { showLast("warn", "تم تجاهل المسح، لم يتغير شيء."); return; }
  }

  session.records.push(rec); newestKey = rec.key; await saveSession(); renderList();
  const notes = recordFlags(rec, session, sharedDevices(session), !!rosterIdx);
  if (notes.length) {
    flash("warn", rec.name, `تم التسجيل مع تنبيه: ${notes.join("، ")}`); vibrate([25, 50, 25]); beep("warn");
    showLast("warn", `تم تسجيل ${rec.name} مع تنبيه: ${notes.join("، ")}.`);
  } else {
    flash("ok", rec.name, `الفرقة ${yearLabel(rec.year)}`); vibrate(25); beep("ok");
    showLast("ok", `تم تسجيل ${rec.name} · الفرقة ${yearLabel(rec.year)}`);
  }
  if (Store.get(KEY.askNote) === true) { paused = true; askNoteFor(rec); }
}

/* =====================================================================
   EXPORT
   ===================================================================== */
function defaultFileName(s) {
  const d = new Date(s.createdAt);
  return `حضور ${s.name} ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`.replace(/[\\/:*?"<>|]/g, "-");
}
function buildWorkbook(s) {
  const idx = buildRosterIndex(rosterById(s.rosterId));
  const shared = sharedDevices(s);
  const head = `${CONFIG.faculty}${CONFIG.university ? " – " + CONFIG.university : ""} — ${s.name} — ${fmtExcel(s.createdAt)}`;
  const recRow = (r, i) => [i + 1, r.name, r.id, typeShort(r.idType), yearLabel(r.year), fmtExcel(r.at),
    [...recordFlags(r, s, shared, !!idx), r.manual ? "يدوي" : "", r.note].filter(Boolean).join(" · ")];
  const recHeaders = ["م", "الاسم", "رقم الهوية", "النوع", "الفرقة", "وقت التسجيل", "ملاحظات"];
  const recWidths = [6, 34, 18, 10, 12, 18, 36];

  const sheets = [{
    name: "الحضور", title: `كشف حضور: ${head}`, headers: recHeaders, widths: recWidths, textCols: [2],
    rows: s.records.map(recRow), footer: `إجمالي الحضور: ${s.records.length}`,
  }];
  if (idx) {
    const absent = absentRows(s, idx);
    const r = idx.roster, textCols = [r.map.nid, r.map.acad].filter((c) => c >= 0);
    sheets.push({
      name: "الغياب", title: `الغائبون من قائمة «${r.name}»: ${absent.length} من ${r.rows.length}`,
      headers: r.headers, widths: r.headers.map((_, i) => (i === r.map.name ? 34 : 18)), textCols,
      rows: absent.map((row) => row.raw),
    });
    const notOn = s.records.filter((x) => !x.rosterRowId);
    if (notOn.length) {
      sheets.push({ name: "غير مدرج", title: `حضروا لكنهم غير موجودين في القائمة: ${notOn.length}`, headers: recHeaders, widths: recWidths, textCols: [2], rows: notOn.map(recRow) });
    }
  }
  return XLSX.write(sheets);
}
function exportFile(s, nameOverride) {
  if (!s.records.length && !s.rosterId) { toast("لا يوجد طلاب لتصديرهم بعد."); return null; }
  const name = (clean(nameOverride) || defaultFileName(s)).replace(/[\\/:*?"<>|]/g, "-").replace(/\.xlsx$/i, "") + ".xlsx";
  return new File([buildWorkbook(s)], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function download(file) {
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  download(file); toast("المشاركة غير متاحة على هذا الجهاز، تم تنزيل الملف بدلاً من ذلك.");
}
$("fileName").oninput = (e) => { e.target.dataset.touched = "1"; };
$("dlBtn").onclick = () => { const f = exportFile(session, $("fileName").value); if (f) { download(f); toast(`تم حفظ ${f.name}`); } };
$("shareBtn").onclick = () => { const f = exportFile(session, $("fileName").value); if (f) shareFile(f); };

/* =====================================================================
   HISTORY
   ===================================================================== */
function renderHistory() {
  const el = $("historyList");
  if (!pastSessions.length) {
    el.innerHTML = `<div class="panel empty">${icon("clock", "ic")}لا توجد جلسات سابقة بعد.<br>عند إنهاء أي جلسة ستظهر هنا.</div>`;
    return;
  }
  el.innerHTML = pastSessions.map((s) => {
    const r = rosterById(s.rosterId);
    const absent = r ? absentRows(s, buildRosterIndex(r)).length : null;
    return `<div class="item">
      <span class="tile">${icon("users", "ic")}</span>
      <div class="grow"><b>${esc(s.name)}</b>
        <small>${fmtDate(s.createdAt)} · ${ar(s.records.length)} حاضر${absent != null ? ` · ${ar(absent)} غائب` : ""}</small></div>
      <button class="icon-btn" data-dl="${s.id}" aria-label="تنزيل ${esc(s.name)}">${icon("down", "ic")}</button>
      <button class="icon-btn" data-share="${s.id}" aria-label="مشاركة ${esc(s.name)}">${icon("share", "ic")}</button>
      <button class="icon-btn del" data-del="${s.id}" aria-label="حذف ${esc(s.name)}">${icon("trash", "ic")}</button>
    </div>`;
  }).join("");
}
$("historyList").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const s = pastSessions.find((x) => x.id === (b.dataset.dl || b.dataset.share || b.dataset.del)); if (!s) return;
  if (b.dataset.dl) { const f = exportFile(s); if (f) { download(f); toast(`تم حفظ ${f.name}`); } }
  if (b.dataset.share) { const f = exportFile(s); if (f) shareFile(f); }
  if (b.dataset.del) {
    if (!(await confirmBox("حذف هذه الجلسة؟", `${s.name} · ${fmtDate(s.createdAt)} · ${ar(s.records.length)} حاضر. لا يمكن التراجع.`, "حذف", true))) return;
    await DB.del("sessions", s.id);
    pastSessions = pastSessions.filter((x) => x !== s);
    renderStaff(); toast("تم حذف الجلسة.");
  }
};

/* =====================================================================
   CLASS LISTS
   ===================================================================== */
function renderRosters() {
  const el = $("rosterList");
  if (!rosters.length) {
    el.innerHTML = `<div class="panel empty">${icon("list", "ic")}لا توجد قوائم بعد.<br>اضغط «استيراد قائمة» واختر ملف Excel من الهاتف.</div>`;
    return;
  }
  el.innerHTML = rosters.map((r) => {
    const bad = r.rows.filter((x) => x.nidBad).length;
    return `<div class="item">
      <span class="tile">${icon("list", "ic")}</span>
      <div class="grow"><b>${esc(r.name)}</b><small>${ar(r.rows.length)} طالب${bad ? ` · ${ar(bad)} رقم قومي غير صحيح` : ""} · ${fmtDate(r.updatedAt || r.createdAt)}</small></div>
      <button class="icon-btn" data-reimport="${r.id}" aria-label="تحديث ${esc(r.name)} من ملف">${icon("upload", "ic")}</button>
      <button class="icon-btn" data-rename="${r.id}" aria-label="إعادة تسمية ${esc(r.name)}">${icon("edit", "ic")}</button>
      <button class="icon-btn del" data-del="${r.id}" aria-label="حذف ${esc(r.name)}">${icon("trash", "ic")}</button>
    </div>`;
  }).join("");
}
let importTarget = null; // roster id being re-imported, or null for a new list
$("importBtn").onclick = () => { importTarget = null; $("importFile").click(); };
$("rosterList").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const r = rosterById(b.dataset.reimport || b.dataset.rename || b.dataset.del); if (!r) return;
  if (b.dataset.reimport) { importTarget = r.id; $("importFile").click(); }
  if (b.dataset.rename) {
    const name = await promptBox("اسم القائمة", r.name); if (!name) return;
    r.name = name; r.updatedAt = new Date().toISOString(); await DB.put("rosters", r); renderStaff();
  }
  if (b.dataset.del) {
    const used = session && session.rosterId === r.id;
    if (used) { toast("هذه القائمة مستخدمة في الجلسة الحالية. أنهِ الجلسة أولًا."); return; }
    if (!(await confirmBox("حذف هذه القائمة؟", `${r.name} · ${ar(r.rows.length)} طالب. الجلسات السابقة المرتبطة بها لن تُظهر الغياب بعد الحذف.`, "حذف", true))) return;
    await DB.del("rosters", r.id); rosters = rosters.filter((x) => x !== r); renderStaff(); toast("تم حذف القائمة.");
  }
};

let importData = null; // { headers, rows, fileName }
$("importFile").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const { headers, rows } = await XLSX.read(file);
    if (!rows.length) throw new Error("empty");
    importData = { headers, rows, fileName: file.name };
    openImport();
  } catch (err) {
    const m = err.message === "old-xls" ? "صيغة .xls القديمة غير مدعومة. افتح الملف في Excel واحفظه بصيغة .xlsx ثم استورده."
      : err.message === "empty" ? "الملف فارغ أو لا يحتوي على صفوف."
      : "تعذّرت قراءة الملف. تأكد أنه ملف Excel (.xlsx) أو CSV.";
    toast(m);
  }
};
function openImport() {
  const { headers, rows, fileName } = importData;
  const g = XLSX.guessColumns(headers, rows);
  const opts = `<option value="-1">— لا يوجد —</option>` + headers.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join("");
  for (const [sel, key] of [["mapName", "name"], ["mapNid", "nid"], ["mapAcad", "acad"], ["mapYear", "year"]]) {
    $(sel).innerHTML = opts; $(sel).value = String(g[key]); $(sel).onchange = renderImportPreview;
  }
  const existing = importTarget && rosterById(importTarget);
  $("impName").value = existing ? existing.name : clean(fileName.replace(/\.(xlsx|csv)$/i, ""));
  $("impErr").textContent = "";
  renderImportPreview();
  $("dlgImport").showModal();
}
function importMap() {
  return { name: +$("mapName").value, nid: +$("mapNid").value, acad: +$("mapAcad").value, year: +$("mapYear").value };
}
function buildRows(map) {
  return importData.rows.map((raw) => {
    const nidRaw = map.nid >= 0 ? digits(raw[map.nid]) : "";
    const nidOk = nidRaw ? NID.parse(nidRaw).ok : false;
    return {
      rid: uuid(), raw,
      name: map.name >= 0 ? clean(raw[map.name]) : "",
      nid: nidOk ? nidRaw : "", nidBad: !!nidRaw && !nidOk,
      acad: map.acad >= 0 ? digits(raw[map.acad]).replace(/\D/g, "") : "",
      year: map.year >= 0 ? digits(raw[map.year]) : "",
    };
  }).filter((r) => r.name || r.nid || r.acad);
}
function renderImportPreview() {
  const map = importMap(), { headers, rows } = importData;
  const on = new Set(Object.values(map).filter((i) => i >= 0));
  const sample = rows.slice(0, 5);
  $("impPreview").innerHTML = `<table><thead><tr>${headers.map((h, i) => `<th${on.has(i) ? ' class="on"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${sample.map((r) => `<tr>${headers.map((_, i) => `<td${on.has(i) ? ' class="on"' : ""}>${esc(r[i] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const built = buildRows(map), bad = built.filter((r) => r.nidBad).length;
  $("impSummary").textContent = `${ar(built.length)} طالب في الملف${bad ? ` · ${ar(bad)} رقم قومي غير صحيح (سيُحفظ الطالب بدونه)` : ""}. راجع الأعمدة ثم احفظ.`;
}
$("impCancel").onclick = () => $("dlgImport").close();
$("importForm").onsubmit = async (e) => {
  e.preventDefault();
  const map = importMap(), name = clean($("impName").value);
  const err = !name ? "اكتب اسمًا للقائمة."
    : map.name < 0 ? "اختر عمود الاسم."
    : map.nid < 0 && map.acad < 0 ? "اختر عمود الرقم القومي أو الرقم الأكاديمي (أو الاثنين) حتى يمكن مطابقة الطلاب."
    : "";
  if (err) { $("impErr").textContent = err; return; }
  const now = new Date().toISOString();
  const existing = importTarget && rosterById(importTarget);
  const roster = existing
    ? Object.assign(existing, { name, headers: importData.headers, map, rows: buildRows(map), updatedAt: now })
    : { id: uuid(), name, headers: importData.headers, map, rows: buildRows(map), createdAt: now, updatedAt: now };
  await DB.put("rosters", roster);
  if (!existing) rosters.push(roster);
  rosters.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  if (session && session.rosterId === roster.id) rosterIdx = buildRosterIndex(roster);
  $("dlgImport").close(); importData = null;
  renderStaff(); toast(`تم حفظ القائمة «${name}» (${ar(roster.rows.length)} طالب).`);
};

/* =====================================================================
   SETTINGS
   ===================================================================== */
$("settingsBtn").onclick = () => {
  $("optSound").checked = Store.get(KEY.sound) !== false;
  $("optNote").checked = Store.get(KEY.askNote) === true;
  $("dlgSettings").showModal();
};
$("optSound").onchange = (e) => { Store.set(KEY.sound, e.target.checked); if (e.target.checked) { unlockAudio(); beep("ok"); } };
$("optNote").onchange = (e) => Store.set(KEY.askNote, e.target.checked);
$("settingsClose").onclick = () => $("dlgSettings").close();
$("wipeBtn").onclick = async () => {
  $("dlgSettings").close();
  const what = `${ar(pastSessions.length)} جلسة سابقة و${ar(rosters.length)} قائمة طلاب`;
  if (!(await confirmBox("حذف كل البيانات؟", `سيتم حذف ${what} من هذا الهاتف.${session ? " الجلسة الحالية لن تُحذف." : ""}`, "متابعة", true))) return;
  if (!(await confirmBox("تأكيد نهائي", "لا يمكن التراجع عن هذا الحذف. هل نزّلت ملفات Excel التي تحتاجها؟", "حذف نهائي", true))) return;
  for (const s of pastSessions) await DB.del("sessions", s.id);
  await DB.clear("rosters");
  pastSessions = []; rosters = [];
  if (session) { session.rosterId = null; rosterIdx = null; await saveSession(); }
  renderStaff(); toast("تم حذف كل البيانات.");
};

/* =====================================================================
   INSTALL & UPDATES
   ===================================================================== */
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
window.addEventListener("appinstalled", () => { installEvt = null; $("installBtn").hidden = true; toast("تم تثبيت التطبيق على الشاشة الرئيسية."); });
$("installBtn").onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch {}
  installEvt = null; $("installBtn").hidden = true;
};
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function maybeShowIosHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("iosHint").hidden = !(ios && !isStandalone() && !Store.get(KEY.iosHint));
}
$("iosHintClose").onclick = () => { Store.set(KEY.iosHint, true); $("iosHint").hidden = true; };

function registerSW() {
  if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
  const offer = (w) => toast("يتوفر تحديث جديد للتطبيق.", { action: "تحديث", persist: true, onAction: () => w.postMessage("skipWaiting") });
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => {});
}

/* =====================================================================
   INIT
   ===================================================================== */
(async function init() {
  renderStudent();
  registerSW();
  try { await loadStaffData(); } catch { toast("تعذّر فتح بيانات الحضور على هذا الهاتف."); }
  if (location.hash === "#staff" || session) showTab(location.hash === "#staff" || (session && !loadProfile()) ? "staff" : "student");
  else renderBadges();
})();
