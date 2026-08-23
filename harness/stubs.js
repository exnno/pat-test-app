/* PATGo test harness — browser stub layer
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Why this file exists
   -------------------
   Before V67 the smoke harness was rebuilt from scratch every release and
   deleted at delivery, so every release re-derived these stubs and rediscovered
   the same traps. The traps are recorded as comments at the point of the code
   that solves them — read them before "simplifying" anything here.

   The stubs are deliberately SHALLOW-BUT-HONEST: they implement enough of each
   API for app code to run, and they THROW rather than silently returning
   undefined when app code uses a corner we have not modelled. A stub that
   quietly returns undefined turns a real bug into a green test. */

'use strict';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
// Minimal element model. Not a spec-compliant DOM and never should be — the app
// is tested at the data layer, and render() is exercised only for "does it throw".

let _elUid = 0;

class ClassList {
  constructor(el) { this._el = el; this._set = new Set(); }
  add(...c)      { c.filter(Boolean).forEach(x => this._set.add(x)); this._sync(); }
  remove(...c)   { c.forEach(x => this._set.delete(x)); this._sync(); }
  toggle(c, on)  {
    const want = (on === undefined) ? !this._set.has(c) : !!on;
    want ? this._set.add(c) : this._set.delete(c);
    this._sync();
    return want;
  }
  contains(c)    { return this._set.has(c); }
  get length()   { return this._set.size; }
  toString()     { return [...this._set].join(' '); }
  _sync()        { this._el._className = this.toString(); }
  _replaceAll(s) {
    this._set = new Set(String(s || '').split(/\s+/).filter(Boolean));
    this._el._className = this.toString();
  }
}

/* Markup that is nothing but autocomplete rows. See the innerHTML setter. */
const SUGGESTION_ROWS_ONLY = /^\s*(?:<button class="suggestion-item"[^>]*>[\s\S]*?<\/button>\s*)+$/;

/* v75: minimal CSSStyleDeclaration. Custom properties live in their own bag,
   exactly as they do in the DOM: setProperty/removeProperty/getPropertyValue are
   the only way to reach them, and getPropertyValue returns '' when absent. */
function makeStyle() {
  const custom = Object.create(null);
  return {
    _custom: custom,
    setProperty(name, value) { custom[name] = String(value); },
    removeProperty(name) { const v = custom[name]; delete custom[name]; return v === undefined ? '' : v; },
    getPropertyValue(name) { return Object.prototype.hasOwnProperty.call(custom, name) ? custom[name] : ''; },
  };
}

class StubElement {
  constructor(tag) {
    this.tagName    = String(tag || 'div').toUpperCase();
    // ⚠ v69: a real element IS nodeType 1, and handleDelegatedClick's very first
    // guard is `el.nodeType === 1`. Without this the walk bailed immediately and
    // EVERY delegated-click test passed without ever reaching the action — the
    // "path that cannot execute headlessly" shape. Text nodes override it below.
    this.nodeType   = tag === '#text' ? 3 : 1;
    this.children   = [];
    this.parentNode = null;
    // v75: style is a real (small) CSSStyleDeclaration rather than a bare object.
    // The keyboard-inset fix writes and REMOVES custom properties on <html>, and
    // the difference between "removed" and "set to 0px" is the whole fail-soft
    // contract — a plain {} cannot express it, so a test against it would have
    // been unable to see the distinction it most needs to check.
    this.style      = makeStyle();
    this.dataset    = {};
    this.attributes = {};
    this._className = '';
    this.classList  = new ClassList(this);
    this._innerHTML = '';
    this._listeners = {};
    this._uid       = ++_elUid;
    this.value      = '';
    this.checked    = false;
    this.disabled   = false;
    this.textContent = '';
    this.id         = '';
  }

  get className()  { return this._className; }
  set className(v) { this.classList._replaceAll(v); }

  // innerHTML is stored as a string and NOT parsed into a tree — render()
  // rebuilds #app.innerHTML wholesale (MAP rule 2) and a real parser would be a
  // large fragile job for little test value.
  //
  // BUT the ids inside it ARE registered with the document. This matters: the
  // whole .bulk-sheet dialog pattern writes its markup into innerHTML and then
  // does `document.getElementById('confirm-sheet-yes').addEventListener(...)`.
  // Without registration that lookup returns null, the wiring silently does not
  // happen, and every sheet-driven flow (restore, delete, prune) becomes
  // untestable while still reporting green. That is precisely the false-green
  // class this harness exists to prevent.
  //
  // ⚠ Registered elements are SYNTHETIC — flat, unparented, no real structure.
  // getElementById finds them and listeners fire on .click(). Do not write
  // assertions that depend on their position in a tree; they have none.
  // v70.1 — ONE narrow exception to "no parsing", for .suggestion-item rows.
  //
  // The three autocomplete dropdowns build their rows as an innerHTML string and
  // then wire each one with `div.querySelectorAll('[data-suggest]').forEach(el =>
  // el.onpointerdown = ...)`. With no children that loop iterates nothing, the
  // wiring silently does not happen, and every assertion about a tap on a
  // suggestion becomes untestable while reporting green — the same false-green
  // class the id registration above exists to prevent. Suggestion picks are
  // precisely what V70.1 repairs, so they have to be reachable.
  //
  // Kept deliberately tiny and opt-in by shape: it fires ONLY when the markup is
  // nothing but suggestion-item buttons. Anything else — every existing caller,
  // including the wholesale #app rebuild — takes the unchanged path below. Do not
  // widen this into a general parser; that was rejected as a large fragile job.
  get innerHTML()  { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v == null ? '' : v);
    this.children = [];
    if (STUB_DOC) {
      for (const m of this._innerHTML.matchAll(/\bid="([^"]+)"/g)) {
        // Re-registering replaces the previous element, which correctly drops
        // listeners from a torn-down sheet rather than leaking them.
        STUB_DOC.register(m[1]);
      }
    }
    if (this._innerHTML && SUGGESTION_ROWS_ONLY.test(this._innerHTML)) {
      for (const m of this._innerHTML.matchAll(/<button\s([^>]*)>([\s\S]*?)<\/button>/g)) {
        const el = new StubElement('button');
        el.textContent = m[2];
        for (const a of m[1].matchAll(/([A-Za-z-]+)="([^"]*)"/g)) el.setAttribute(a[1], a[2]);
        el.parentNode = this;
        this.children.push(el);
      }
    }
  }

  appendChild(c)  { c.parentNode = this; this.children.push(c); return c; }
  append(...cs)   { cs.forEach(c => this.appendChild(c)); }
  prepend(c)      { c.parentNode = this; this.children.unshift(c); return c; }
  removeChild(c)  {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove()        { if (this.parentNode) this.parentNode.removeChild(this); }
  insertBefore(n, ref) {
    const i = this.children.indexOf(ref);
    n.parentNode = this;
    if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
    return n;
  }
  insertAdjacentHTML(_pos, html) { this._innerHTML += String(html); }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = String(v);
    }
  }
  getAttribute(k) {
    if (k === 'class') return this._className;
    if (k === 'id') return this.id;
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }
  hasAttribute(k)    { return this.getAttribute(k) !== null; }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(type, fn)    { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const a = this._listeners[type];
    if (a) this._listeners[type] = a.filter(f => f !== fn);
  }
  // Synchronous dispatch. Real browsers are synchronous for dispatchEvent too,
  // so tests that fire an event can assert on the result on the next line.
  //
  // ⚠ v77: a real element fires BOTH its addEventListener registrations and its
  // `on<type>` property handler. This stub used to fire only the former, which
  // made every `el.ontouchstart = …` binding in the app invisible to
  // dispatchEvent — so a test for one had no choice but to reach in and call the
  // property by hand, which is the V67 "listener was never bound" shape wearing
  // a disguise: a handler that is written but never attached passes a hand-call
  // and fails on the phone. Firing both means a hold gesture, or anything else
  // bound by property, can be driven through the same surface the browser uses.
  // Property handler runs after the listeners, matching registration order for
  // the common case where only one of the two exists.
  dispatchEvent(ev) {
    ev.target ||= this;
    ev.currentTarget = this;
    (this._listeners[ev.type] || []).forEach(fn => fn.call(this, ev));
    const prop = this['on' + ev.type];
    if (typeof prop === 'function') prop.call(this, ev);
    return !ev.defaultPrevented;
  }

  // Descendant queries walk real appended children only. Elements that exist
  // only inside an innerHTML string are invisible here — by design, see above.
  _walk(out = []) {
    for (const c of this.children) { out.push(c); c._walk(out); }
    return out;
  }
  querySelector(sel)    { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const s = String(sel).trim();
    return this._walk().filter(el => {
      if (s.startsWith('#'))  return el.id === s.slice(1);
      if (s.startsWith('.'))  return el.classList.contains(s.slice(1));
      if (s.startsWith('['))  {
        const m = s.match(/^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/);
        if (!m) return false;
        const v = el.getAttribute(m[1]);
        return m[2] === undefined ? v !== null : v === m[2];
      }
      return el.tagName === s.toUpperCase();
    });
  }
  closest(sel) {
    let n = this;
    while (n) {
      if (sel.startsWith('.') && n.classList && n.classList.contains(sel.slice(1))) return n;
      if (sel.startsWith('#') && n.id === sel.slice(1)) return n;
      if (!sel.startsWith('.') && !sel.startsWith('#') && n.tagName === sel.toUpperCase()) return n;
      n = n.parentNode;
    }
    return null;
  }
  focus()  { this.ownerDocument_activeElement = true; STUB_DOC.activeElement = this; }
  blur()   { if (STUB_DOC.activeElement === this) STUB_DOC.activeElement = null; }
  // v67: real methods, not omissions. focusAssetForScan() calls focus() then
  // select() inside one try/catch — with select() missing, the TypeError was
  // caught and the test still saw a focused element, i.e. the right result via
  // the wrong mechanism. Recording the calls lets a test assert the SELECTION
  // happened, which is the half that stops an unrecognised scan appending.
  select() { this.selectionStart = 0; this.selectionEnd = String(this.value || '').length; this.wasSelected = true; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; this.wasSelected = false; }
  click()  { this.dispatchEvent(makeEvent('click')); }
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
}

function makeEvent(type, props = {}) {
  return {
    type,
    defaultPrevented: false,
    preventDefault()  { this.defaultPrevented = true; },
    stopPropagation() {},
    target: null,
    currentTarget: null,
    ...props,
  };
}

let STUB_DOC = null;

function makeDocument() {
  const byId = new Map();

  const doc = {
    _byId: byId,
    activeElement: null,
    _listeners: {},

    createElement(tag) {
      const el = new StubElement(tag);
      // id is a plain property on StubElement; registering on assignment would
      // need a setter. The app always sets ids via setAttribute or on elements
      // that already exist in index.html, so registration happens in register().
      return el;
    },
    createTextNode(t) { const el = new StubElement('#text'); el.textContent = String(t); return el; },
    createDocumentFragment() { return new StubElement('#fragment'); },

    getElementById(id) { return byId.get(id) || null; },

    querySelector(sel)    { return doc.body.querySelector(sel) || doc._registryQuery(sel)[0] || null; },
    querySelectorAll(sel) {
      const inTree = doc.body.querySelectorAll(sel);
      const reg = doc._registryQuery(sel).filter(e => !inTree.includes(e));
      return inTree.concat(reg);
    },
    _registryQuery(sel) {
      const s = String(sel).trim();
      const all = [...byId.values()];
      if (s.startsWith('#')) return all.filter(e => e.id === s.slice(1));
      if (s.startsWith('.')) return all.filter(e => e.classList.contains(s.slice(1)));
      return all.filter(e => e.tagName === s.toUpperCase());
    },

    addEventListener(t, fn) { (doc._listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) {
      const a = doc._listeners[t];
      if (a) doc._listeners[t] = a.filter(f => f !== fn);
    },
    dispatchEvent(ev) {
      ev.target ||= doc;
      (doc._listeners[ev.type] || []).forEach(fn => fn.call(doc, ev));
      return !ev.defaultPrevented;
    },

    execCommand() { return true; },

    // Register an element under an id so getElementById can find it. Used by
    // the fixture builder to stand up the ids index.html provides.
    register(id, tag = 'div') {
      const el = new StubElement(tag);
      el.id = id;
      byId.set(id, el);
      return el;
    },
  };

  doc.body            = new StubElement('body');
  doc.head            = new StubElement('head');
  doc.documentElement = new StubElement('html');
  doc.scrollingElement = doc.documentElement;
  doc.body.ownerDocument = doc;

  STUB_DOC = doc;
  return doc;
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------
// Real behaviour that matters to the app: values are ALWAYS strings. Storing a
// number and reading it back as a number is the classic false-green — a stub
// that skips String() lets `if (v === 1)` pass here and fail on a phone.

function makeLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  return {
    get length() { return map.size; },
    key(i)       { return [...map.keys()][i] ?? null; },
    getItem(k)   { const v = map.get(String(k)); return v === undefined ? null : v; },
    setItem(k, v) {
      if (this._quotaExceededAfter != null && map.size >= this._quotaExceededAfter) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(String(k), String(v));
    },
    removeItem(k) { map.delete(String(k)); },
    clear()       { map.clear(); },
    _map: map,
    _snapshot()   { return Object.fromEntries(map); },
    _quotaExceededAfter: null,
  };
}

// ---------------------------------------------------------------------------
// IndexedDB (photos.js)
// ---------------------------------------------------------------------------
// TRAP (rediscovered in three separate releases): IDB request callbacks fire
// ASYNCHRONOUSLY. Calling onsuccess synchronously inside open()/get() makes app
// code that assigns the handler AFTER the call — which is the normal pattern —
// never see it, so the promise never settles and the test times out or, worse,
// resolves undefined and passes. Every callback here is deferred a macrotask.

function makeIndexedDB() {
  const stores = new Map(); // storeName -> Map(key -> value)

  function fire(req, prop, value) {
    setTimeout(() => {
      if (prop === 'onerror') req.error = value;
      else req.result = value;
      const fn = req[prop];
      if (typeof fn === 'function') fn({ target: req });
    }, 0);
  }

  function makeRequest() {
    return { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
  }

  function makeObjectStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      name,
      put(value, key) {
        const k = key !== undefined ? key : value?.id;
        const r = makeRequest();
        data.set(k, value);
        fire(r, 'onsuccess', k);
        return r;
      },
      get(key)    { const r = makeRequest(); fire(r, 'onsuccess', data.get(key)); return r; },
      delete(key) { const r = makeRequest(); data.delete(key); fire(r, 'onsuccess', undefined); return r; },
      clear()     { const r = makeRequest(); data.clear(); fire(r, 'onsuccess', undefined); return r; },
      getAll()    { const r = makeRequest(); fire(r, 'onsuccess', [...data.values()]); return r; },
      getAllKeys(){ const r = makeRequest(); fire(r, 'onsuccess', [...data.keys()]); return r; },
      count()     { const r = makeRequest(); fire(r, 'onsuccess', data.size); return r; },
      createIndex() { return { getAll: () => { const r = makeRequest(); fire(r, 'onsuccess', [...data.values()]); return r; } }; },
      index()       { return { getAll: () => { const r = makeRequest(); fire(r, 'onsuccess', [...data.values()]); return r; } }; },
    };
  }

  function makeDB() {
    return {
      objectStoreNames: { contains: (n) => stores.has(n) },
      createObjectStore(name) { stores.set(name, new Map()); return makeObjectStore(name); },
      transaction(names) {
        const tx = { oncomplete: null, onerror: null, onabort: null, abort() {} };
        tx.objectStore = (n) => makeObjectStore(n);
        setTimeout(() => { if (typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx }); }, 0);
        return tx;
      },
      close() {},
    };
  }

  return {
    _stores: stores,
    open(_name, _version) {
      const req = makeRequest();
      const db = makeDB();
      setTimeout(() => {
        req.result = db;
        // upgradeneeded first, then success — the real ordering. Getting this
        // backwards means the app's store creation runs after its first write.
        if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded({ target: req });
        if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
      }, 0);
      return req;
    },
    deleteDatabase() { const r = makeRequest(); stores.clear(); fire(r, 'onsuccess', undefined); return r; },
  };
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

function makeNavigator(opts = {}) {
  const calls = { share: [], clipboard: [], vibrate: [] };
  return {
    _calls: calls,
    userAgent: opts.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    onLine: true,
    standalone: opts.standalone ?? true,
    // canShare/share default to PRESENT because the iPhone PWA is the primary
    // target. Tests that need the fallback path delete these explicitly.
    canShare(d) { calls.share.push({ kind: 'canShare', d }); return opts.canShare !== false; },
    async share(d) { calls.share.push({ kind: 'share', d }); if (opts.shareThrows) throw new Error('AbortError'); },
    clipboard: {
      async writeText(t) { calls.clipboard.push(t); if (opts.clipboardThrows) throw new Error('denied'); },
      async readText() { return calls.clipboard[calls.clipboard.length - 1] || ''; },
    },
    vibrate(p) { calls.vibrate.push(p); return true; },
    serviceWorker: {
      controller: null,
      async register() { return { addEventListener() {}, installing: null, waiting: null, update() {} }; },
      async getRegistration() { return null; },
      addEventListener() {},
    },
    storage: { async estimate() { return { usage: 1024 * 1024, quota: 1024 * 1024 * 500 }; } },
  };
}

class StubBlob {
  constructor(parts = [], opts = {}) {
    this._parts = parts;
    this.type = opts.type || '';
    this.size = parts.reduce((n, p) => n + String(p).length, 0);
  }
  async text() { return this._parts.map(String).join(''); }
  slice() { return new StubBlob(this._parts, { type: this.type }); }
}

class StubFile extends StubBlob {
  constructor(parts, name, opts = {}) {
    super(parts, opts);
    this.name = name;
    this.lastModified = Date.now();
  }
}

class StubFileReader {
  constructor() { this.result = null; this.onload = null; this.onerror = null; this.onloadend = null; }
  _done(v) {
    this.result = v;
    setTimeout(() => {
      if (typeof this.onload === 'function') this.onload({ target: this });
      if (typeof this.onloadend === 'function') this.onloadend({ target: this });
    }, 0);
  }
  readAsText(blob)        { Promise.resolve(blob.text()).then(t => this._done(t)); }
  readAsDataURL(blob)     {
    Promise.resolve(blob.text()).then(t =>
      this._done(`data:${blob.type || 'application/octet-stream'};base64,` +
        Buffer.from(t, 'utf8').toString('base64')));
  }
  readAsArrayBuffer(blob) { Promise.resolve(blob.text()).then(t => this._done(Buffer.from(t, 'utf8'))); }
}

function makeCaches() {
  const named = new Map();
  return {
    _named: named,
    async keys() { return [...named.keys()]; },
    async open(n) {
      if (!named.has(n)) named.set(n, new Map());
      const c = named.get(n);
      return {
        async addAll(urls) { urls.forEach(u => c.set(u, { ok: true })); },
        async put(k, v)    { c.set(String(k), v); },
        async match(k)     { return c.get(String(k)) || undefined; },
        async keys()       { return [...c.keys()].map(u => ({ url: u })); },
        async delete(k)    { return c.delete(String(k)); },
      };
    },
    async match() { return undefined; },
    async delete(n) { return named.delete(n); },
  };
}

/* Build a complete browser environment.
   Returns the sandbox object to be handed to vm.createContext(). */
function makeEnvironment(opts = {}) {
  const doc      = makeDocument();
  const storage  = makeLocalStorage(opts.localStorage || {});
  const nav      = makeNavigator(opts.navigator || {});
  const idb      = makeIndexedDB();
  const cacheApi = makeCaches();

  const objectUrls = [];

  const win = {
    // Populated with the sandbox itself after createContext so that
    // `window.foo = x` and bare `foo = x` refer to the same object.
    location: {
      href: 'https://exnno.github.io/pat-test-app/',
      origin: 'https://exnno.github.io',
      pathname: '/pat-test-app/',
      search: '',
      hash: '',
      reload() {},
      assign() {},
      replace() {},
    },
    devicePixelRatio: 3,
    innerWidth: 390,
    innerHeight: 844,

    // v75: ABSENT BY DEFAULT, AND THAT IS DELIBERATE — it makes the fail-soft
    // path (older iOS, no visualViewport) the harness's default state, so any
    // test that forgets to install one is exercising "the app must still work
    // with no keyboard support at all" rather than silently exercising nothing.
    // opts.visualViewport installs one; tests move it with app.win.__vvSet().
    visualViewport: opts.visualViewport || undefined,
    scrollX: 0,
    scrollY: 0,
    _listeners: {},
    addEventListener(t, fn) { (win._listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) {
      const a = win._listeners[t];
      if (a) win._listeners[t] = a.filter(f => f !== fn);
    },
    dispatchEvent(ev) { (win._listeners[ev.type] || []).forEach(fn => fn.call(win, ev)); return true; },
    scrollTo() {},
    getComputedStyle() { return { getPropertyValue: () => '' }; },
    matchMedia(q) {
      return {
        matches: !!(opts.matchMedia && opts.matchMedia[q]),
        media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      };
    },
    // jsPDF is never loaded here — report.js injects it on demand and it cannot
    // run headlessly. Leaving this undefined is DELIBERATE: it is what forces
    // report.js coverage to be source-guarded rather than executed, which is the
    // gap that let the V66 defect pass 151/151 assertions.
    jspdf: undefined,
    AudioContext: function () { return { createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0 } }), createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0, close() {} }; },
  };
  win.webkitAudioContext = win.AudioContext;

  const sandbox = {
    window: win,
    document: doc,
    localStorage: storage,
    sessionStorage: makeLocalStorage(),
    navigator: nav,
    indexedDB: idb,
    caches: cacheApi,
    location: win.location,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet, Symbol,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    Intl, Buffer, structuredClone,

    // bugreport.js reads screen.width/height for the SCREEN diagnostic line.
    // typeof-guarded there, so omitting it would silently take the 'unknown'
    // branch and never test the real one.
    screen: { width: 390, height: 844, availWidth: 390, availHeight: 844 },

    Blob: StubBlob,
    File: StubFile,
    FileReader: StubFileReader,
    FormData: class { constructor() { this._d = new Map(); } append(k, v) { this._d.set(k, v); } get(k) { return this._d.get(k); } },
    Image: class { constructor() { this.onload = null; this.onerror = null; this.src = ''; this.width = 100; this.height = 100; } },
    Audio: class { constructor() {} play() { return Promise.resolve(); } pause() {} },
    CustomEvent: class { constructor(t, o = {}) { Object.assign(this, makeEvent(t), o.detail ? { detail: o.detail } : {}); } },
    Event: class { constructor(t) { Object.assign(this, makeEvent(t)); } },

    URL: {
      _objectUrls: objectUrls,
      createObjectURL(b) { const u = `blob:stub/${objectUrls.length}`; objectUrls.push({ url: u, blob: b }); return u; },
      revokeObjectURL(u) { const i = objectUrls.findIndex(o => o.url === u); if (i >= 0) objectUrls.splice(i, 1); },
    },

    requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 0); },
    cancelAnimationFrame(id)  { clearTimeout(id); },

    // fetch is DENIED by default. The app must work fully offline; a test that
    // silently succeeds because fetch returned a stub response is testing the
    // stub. Tests that need it install their own.
    fetch: async (url) => { throw new Error(`harness: unexpected network fetch to ${url}`); },

    alert()   { throw new Error('harness: alert() is banned in this app (MAP rule 11)'); },
    confirm() { throw new Error('harness: confirm() is banned in this app (MAP rule 11)'); },
    prompt()  { throw new Error('harness: prompt() is banned in this app (MAP rule 11)'); },

    // Handles for tests
    _harness: {
      doc, storage, nav, idb, cacheApi, objectUrls,
      makeEvent, StubElement, makeLocalStorage,
    },
  };

  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

module.exports = {
  makeEnvironment,
  makeDocument,
  makeLocalStorage,
  makeIndexedDB,
  makeNavigator,
  makeEvent,
  StubElement,
  StubBlob,
  StubFile,
};
