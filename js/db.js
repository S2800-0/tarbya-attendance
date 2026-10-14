/* Storage.
   - Small settings and the student profile: localStorage (window.Store).
   - Sessions and class lists: IndexedDB (window.DB), because localStorage is capped
     at ~5 MB and blocks the page. Falls back to memory if IndexedDB is unavailable
     (private mode on some browsers), so the app still works for one visit. */
(function () {
  "use strict";

  const Store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const NAME = "tarbya-attendance", VERSION = 1, STORES = ["sessions", "rosters"];
  let dbPromise = null;
  let memory = null; // fallback: { sessions: Map, rosters: Map }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch { return resolve(null); }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }).then((db) => {
      if (!db) memory = { sessions: new Map(), rosters: new Map() };
      return db;
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => {
      if (!db) return fn(null);
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const result = fn(t.objectStore(store));
        t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    });
  }

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  const DB = {
    async all(store) {
      const db = await open();
      if (!db) return [...memory[store].values()].map(clone);
      return tx(store, "readonly", (s) => s.getAll());
    },
    async get(store, id) {
      const db = await open();
      if (!db) return clone(memory[store].get(id));
      return tx(store, "readonly", (s) => s.get(id));
    },
    async put(store, value) {
      const db = await open();
      if (!db) { memory[store].set(value.id, clone(value)); return; }
      await tx(store, "readwrite", (s) => { s.put(clone(value)); });
    },
    async del(store, id) {
      const db = await open();
      if (!db) { memory[store].delete(id); return; }
      await tx(store, "readwrite", (s) => { s.delete(id); });
    },
    async clear(store) {
      const db = await open();
      if (!db) { memory[store].clear(); return; }
      await tx(store, "readwrite", (s) => { s.clear(); });
    },
    async persistent() {
      return !!(await open());
    },
  };

  /** One-time move of a v1 open session (localStorage "tq.session") into IndexedDB. */
  async function migrateV1() {
    const old = Store.get("tq.session");
    if (!old || !Array.isArray(old.records)) return;
    const session = {
      id: old.id || crypto.randomUUID(),
      name: old.name || "جلسة",
      createdAt: old.createdAt || new Date().toISOString(),
      updatedAt: old.updatedAt || new Date().toISOString(),
      open: old.open !== false,
      dupScans: old.dupScans || 0,
      rosterId: null,
      records: old.records.map((r) => ({
        key: r.key, name: r.name, idType: "a", id: r.id, year: r.year,
        device: r.device || "", at: r.at, note: r.note || "", manual: !!r.manual,
        flags: [], rosterRowId: null,
      })),
    };
    await DB.put("sessions", session);
    Store.del("tq.session");
  }

  window.Store = Store;
  window.DB = DB;
  window.migrateV1 = migrateV1;
})();
