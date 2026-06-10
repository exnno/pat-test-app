/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — Clients & Sites ==============
// Clients & Sites (v19): data model + Settings -> Clients page actions.

// ---------- v19: Clients & Sites ----------
//
// Two flat arrays in a parent/child relationship. A client has a name; a site
// belongs to one client (by clientId) and has a name. These drive the New
// Session pickers and the Settings → Clients page. They are NEVER the source of
// truth for what a session records — each session keeps its own `site` text
// snapshot — so editing/deleting here can't corrupt saved work.

// Defensive loaders: any non-array or malformed entry collapses to a clean list,
// mirroring the SQP/Multi Pick approach so a corrupt key can't wedge the app.
function loadClients() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(CLIENTS_KEY) || 'null'); } catch {}
  if (!Array.isArray(raw)) return [];
  return raw
    .map(c => ({ id: String(c && c.id || ''), name: String(c && c.name || '').trim() }))
    .filter(c => c.id && c.name);
}

function loadSites() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SITES_KEY) || 'null'); } catch {}
  if (!Array.isArray(raw)) return [];
  return raw
    .map(s => ({
      id: String(s && s.id || ''),
      clientId: String(s && s.clientId || ''),
      name: String(s && s.name || '').trim()
    }))
    .filter(s => s.id && s.clientId && s.name);
}

// First-V19 seed. Each distinct existing session `site` string becomes a client
// with a single same-named site. Case-insensitive dedupe on the client name.
// Only writes if it actually creates something. No-op when there are no
// sessions or no usable site strings.
function seedClientsSitesFromSessions() {
  const seen = new Map();   // lowercased name -> client id
  let added = false;
  state.sessions.forEach(sess => {
    const raw = String(sess && sess.site || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    const clientId = 'client_' + uid();
    state.clients.push({ id: clientId, name: raw });
    state.sites.push({ id: 'site_' + uid(), clientId, name: raw });
    seen.set(key, clientId);
    added = true;
  });
  if (added) save();
}

// Lookups + derived lists.
function clientById(id) { return state.clients.find(c => c.id === id) || null; }
function siteById(id) { return state.sites.find(s => s.id === id) || null; }
function sitesForClient(clientId) {
  return state.sites
    .filter(s => s.clientId === clientId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
function sortedClients() {
  return state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// Find an existing client by name (case-insensitive), or null.
function findClientByName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return state.clients.find(c => c.name.toLowerCase() === n) || null;
}
// Find an existing site by name within a client (case-insensitive), or null.
function findSiteByName(clientId, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || !clientId) return null;
  return state.sites.find(s => s.clientId === clientId && s.name.toLowerCase() === n) || null;
}

// Add helpers — return the existing record if the name already exists (so the
// New Session form's "save what I typed" path never creates duplicates). These
// mutate state but DO NOT save() or render() — the caller decides when.
function ensureClient(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = findClientByName(trimmed);
  if (existing) return existing;
  const client = { id: 'client_' + uid(), name: trimmed };
  state.clients.push(client);
  return client;
}
function ensureSite(clientId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || !clientId) return null;
  const existing = findSiteByName(clientId, trimmed);
  if (existing) return existing;
  const site = { id: 'site_' + uid(), clientId, name: trimmed };
  state.sites.push(site);
  return site;
}

// v20: Non-destructive rebuild of the Clients/Sites lists from every session's
// stored `site` snapshot. Unlike seedClientsSitesFromSessions() (which only
// runs once, on a totally empty install), this is a user-triggered action that
// ADDS any client/site found in the sessions that isn't already in the lists —
// without touching, renaming, or deleting anything already there. It catches
// sites that arrived via CSV import after the one-shot seed.
//
// Parsing: V19+ snapshots are "Client — Site" (em dash). We split on that to
// recover the two parts. Older/plain snapshots (no dash) are treated as a
// site-only entry, mirroring how such sessions display — added under a client
// of the same name so the pair is self-consistent (same shape the seed makes).
// Idempotent: ensureClient/ensureSite return existing records, so running it
// repeatedly never duplicates. Returns the count of new records added.
function rebuildClientsFromSessions() {
  let added = 0;
  state.sessions.forEach(sess => {
    const snap = String(sess && sess.site || '').trim();
    if (!snap) return;
    let clientName, siteName;
    const dash = snap.indexOf(' — ');
    if (dash !== -1) {
      clientName = snap.slice(0, dash).trim();
      siteName = snap.slice(dash + 3).trim();
    } else {
      // Plain snapshot: client and site take the same name (seed convention).
      clientName = snap;
      siteName = snap;
    }
    if (!clientName) clientName = siteName;
    if (!siteName) siteName = clientName;
    const hadClient = !!findClientByName(clientName);
    const client = ensureClient(clientName);
    if (!client) return;
    if (!hadClient) added++;
    const hadSite = !!findSiteByName(client.id, siteName);
    ensureSite(client.id, siteName);
    if (!hadSite) added++;
  });
  if (added) save();
  return added;
}
// Falls back gracefully: both → "Client — Site"; one → that one; neither → ''.
// The em dash matches the placeholder style used elsewhere in the app.
function composeSiteSnapshot(clientName, siteName) {
  const c = String(clientName || '').trim();
  const s = String(siteName || '').trim();
  if (c && s) return `${c} — ${s}`;
  return c || s || '';
}

// ----- Settings → Clients page actions -----
// All confirm-on-destructive, save() + render() at the end. Deleting a client
// also deletes its sites (after a count-aware confirm). None of this touches any
// session's stored `site` snapshot.

function addClientFromDialog() {
  const name = state.clientsPage.clientDialog.name.trim();
  if (!name) return;
  if (findClientByName(name)) {
    alert('A client with that name already exists.');
    return;
  }
  const client = ensureClient(name);
  state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
  if (client) state.clientsPage.expandedClientId = client.id;
  save();
  render();
}

function renameClientFromDialog() {
  const { editingId, name } = state.clientsPage.clientDialog;
  const trimmed = name.trim();
  const client = clientById(editingId);
  if (!client || !trimmed) return;
  const clash = findClientByName(trimmed);
  if (clash && clash.id !== client.id) {
    alert('A client with that name already exists.');
    return;
  }
  client.name = trimmed;
  state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
  save();
  render();
}

function deleteClient(clientId) {
  const client = clientById(clientId);
  if (!client) return;
  const childSites = sitesForClient(clientId);
  const msg = childSites.length
    ? `Delete "${client.name}" and its ${childSites.length} site${childSites.length === 1 ? '' : 's'}?\n\nThis only removes them from your client list — sessions you've already created keep their site name.`
    : `Delete "${client.name}"?\n\nThis only removes it from your client list — sessions you've already created keep their site name.`;
  if (!confirm(msg)) return;
  state.clients = state.clients.filter(c => c.id !== clientId);
  state.sites = state.sites.filter(s => s.clientId !== clientId);
  if (state.clientsPage.expandedClientId === clientId) {
    state.clientsPage.expandedClientId = null;
  }
  save();
  render();
}

function addSiteFromDialog() {
  const { clientId, name } = state.clientsPage.siteDialog;
  const trimmed = name.trim();
  if (!clientId || !trimmed) return;
  if (findSiteByName(clientId, trimmed)) {
    alert('That client already has a site with that name.');
    return;
  }
  ensureSite(clientId, trimmed);
  state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
  state.clientsPage.expandedClientId = clientId;
  save();
  render();
}

function renameSiteFromDialog() {
  const { editingId, name } = state.clientsPage.siteDialog;
  const trimmed = name.trim();
  const site = siteById(editingId);
  if (!site || !trimmed) return;
  const clash = findSiteByName(site.clientId, trimmed);
  if (clash && clash.id !== site.id) {
    alert('That client already has a site with that name.');
    return;
  }
  site.name = trimmed;
  state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
  save();
  render();
}

function deleteSite(siteId) {
  const site = siteById(siteId);
  if (!site) return;
  if (!confirm(`Delete site "${site.name}"?\n\nThis only removes it from your client list — sessions already created keep their site name.`)) return;
  state.sites = state.sites.filter(s => s.id !== siteId);
  save();
  render();
}

// v16: transient toast — a small auto-dismissing pill at the bottom of the
// screen. Appended directly to <body> (outside #app) so it survives the next
// render() (which rewrites #app and sweeps stray sheets/backdrops, but leaves
// .toast alone). Self-contained: replaces any existing toast, fades in, then
// removes itself after a short delay. No state needed.
