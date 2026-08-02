/*!
 * PATGo PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v22 — Clients & Sites ==============
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
    .map(c => ({
      id: String(c && c.id || ''),
      name: String(c && c.name || '').trim(),
      // v43: cloud prep. Passthrough fields for future sync (userId for ownership,
      // lastModified timestamp). Defensive — old clients without these fields are fine.
      userId: (c && typeof c.userId === 'string') ? c.userId : null,
      lastModified: (c && typeof c.lastModified === 'string') ? c.lastModified : null
    }))
    .filter(c => c.id && c.name);
}

function loadSites() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SITES_KEY) || 'null'); } catch {}
  if (!Array.isArray(raw)) return [];
  // v26 (Q2=A): a site may now have an EMPTY clientId — an "Unassigned" site
  // not yet attached to a client. Previously such sites were dropped here; now
  // we keep them (clientId coerced to '') and surface them in an Unassigned
  // group on the Clients page, where they can be assigned to a client later.
  return raw
    .map(s => ({
      id: String(s && s.id || ''),
      clientId: String(s && s.clientId || ''),
      name: String(s && s.name || '').trim(),
      // v43: cloud prep. Passthrough fields for future sync.
      userId: (s && typeof s.userId === 'string') ? s.userId : null,
      lastModified: (s && typeof s.lastModified === 'string') ? s.lastModified : null
    }))
    .filter(s => s.id && s.name);   // clientId no longer required
}

// First-V19 seed. Each distinct existing session `site` string becomes a client
// with a single same-named site. Case-insensitive dedupe on the client name.
// Only writes if it actually creates something. No-op when there are no
// sessions or no usable site strings.
function seedClientsSitesFromSessions() {
  const seen = new Map();   // lowercased name -> client id
  const now = new Date().toISOString();
  let added = false;
  state.sessions.forEach(sess => {
    const raw = String(sess && sess.site || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    const clientId = 'client_' + uid();
    // v43: add userId (null for now, set when synced) and lastModified timestamp
    state.clients.push({ id: clientId, name: raw, userId: null, lastModified: now });
    state.sites.push({ id: 'site_' + uid(), clientId, name: raw, userId: null, lastModified: now });
    seen.set(key, clientId);
    added = true;
  });
  if (added) save();
}

// Lookups + derived lists.
function clientById(id) { return state.clients.find(c => c.id === id) || null; }
function siteById(id) { return state.sites.find(s => s.id === id) || null; }
// v56: resolve a human client name for a session, for the retest reminders list.
// Prefers the structured clientId ref; returns '' when there's no distinct client
// (the caller then just shows the site/name). Defensive — sessions predating the
// structured refs simply have no clientId and return ''.
function clientNameForSession(sess) {
  if (!sess || !sess.clientId) return '';
  const c = clientById(sess.clientId);
  return c ? c.name : '';
}
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

// v26 (Q2=A): sites with no client. Surfaced in an "Unassigned" group at the
// bottom of the Clients page, where each can be assigned to a client later.
function unassignedSites() {
  return state.sites
    .filter(s => !s.clientId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// v26: find an orphan (clientless) site by name, case-insensitive.
function findOrphanSiteByName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return state.sites.find(s => !s.clientId && s.name.toLowerCase() === n) || null;
}

// v26: ensure an orphan site exists (no client attached). Returns the existing
// orphan if one with that name already exists. Mutates state but does NOT
// save()/render() — caller decides. Used by the New Session "site, no client"
// path (Q1=A) and by CSV import of a site-only row (Q6=A).
function ensureOrphanSite(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = findOrphanSiteByName(trimmed);
  if (existing) return existing;
  const site = { id: 'site_' + uid(), clientId: '', name: trimmed };
  state.sites.push(site);
  return site;
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

// v26 (Q5=A): split a stored `site` snapshot back into { client, site } for the
// CSV column split. A "Client — Site" snapshot (em dash) splits into its two
// parts. A plain snapshot (no dash) is treated as SITE-ONLY — site gets the
// text, client is left blank — matching how a site-only session (Q1=A) is now
// represented. This is display/export-only; it never mutates the session.
function splitSiteSnapshot(snapshot) {
  const snap = String(snapshot || '').trim();
  if (!snap) return { client: '', site: '' };
  const dash = snap.indexOf(' — ');
  if (dash !== -1) {
    return {
      client: snap.slice(0, dash).trim(),
      site: snap.slice(dash + 3).trim()
    };
  }
  return { client: '', site: snap };
}

// ----- Settings → Clients page actions -----
// All confirm-on-destructive, save() + render() at the end. Deleting a client
// also deletes its sites (after a count-aware confirm). None of this touches any
// session's stored `site` snapshot.

function addClientFromDialog() {
  const name = state.clientsPage.clientDialog.name.trim();
  if (!name) return;
  if (findClientByName(name)) {
    showToast('A client with that name already exists');
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
    showToast('A client with that name already exists');
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
    ? `Delete "${client.name}" and its ${childSites.length} site${childSites.length === 1 ? '' : 's'}? This only removes them from your client list — sessions you've already created keep their site name.`
    : `Delete "${client.name}"? This only removes it from your client list — sessions you've already created keep their site name.`;
  openConfirmSheet({
    title: 'Delete client?',
    message: msg,
    confirmLabel: 'Delete',
    onConfirm: () => {
      state.clients = state.clients.filter(c => c.id !== clientId);
      state.sites = state.sites.filter(s => s.clientId !== clientId);
      if (state.clientsPage.expandedClientId === clientId) {
        state.clientsPage.expandedClientId = null;
      }
      save();
      render();
    }
  });
}

function addSiteFromDialog() {
  const { clientId, name } = state.clientsPage.siteDialog;
  const trimmed = name.trim();
  if (!clientId || !trimmed) return;
  if (findSiteByName(clientId, trimmed)) {
    showToast('That client already has a site with that name');
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
    showToast('That client already has a site with that name');
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
  openConfirmSheet({
    title: 'Delete site?',
    message: `Delete site "${site.name}"? This only removes it from your client list — sessions already created keep their site name.`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      state.sites = state.sites.filter(s => s.id !== siteId);
      save();
      render();
    }
  });
}

// v26 (Q3=B): open the "assign / move site to a client" sheet. Works for an
// orphan site (assign it for the first time) and for an already-assigned site
// (move it to a different client). The sheet lets the user pick an existing
// client or type a new one.
function openSiteAssignDialog(siteId) {
  const site = siteById(siteId);
  if (!site) return;
  state.clientsPage.assignDialog = { siteId, name: '', clash: null };
  // Close any other open dialog so only one sheet shows at a time.
  state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
  state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
  render();
}

function cancelSiteAssignDialog() {
  state.clientsPage.assignDialog = { siteId: null, name: '', clash: null };
  render();
}

// v26 (Q3=B): first stage — resolve the typed target client and either complete
// the move immediately, or, if the target already has a same-named site, switch
// the sheet into the clash-choice stage (Q14=B). Reads the live input value via
// the caller (dispatch) which writes assignDialog.name before calling.
function commitSiteAssign() {
  const ad = state.clientsPage.assignDialog;
  const site = siteById(ad.siteId);
  const targetName = String(ad.name || '').trim();
  if (!site || !targetName) return;

  const targetClient = ensureClient(targetName);
  if (!targetClient) return;

  // No-op: already under this client.
  if (site.clientId === targetClient.id) {
    finishSiteAssign(targetClient.id);
    return;
  }

  const clash = findSiteByName(targetClient.id, site.name);
  if (clash && clash.id !== site.id) {
    // Switch the sheet to the three-way choice; nothing committed yet.
    state.clientsPage.assignDialog.clash = { targetClientId: targetClient.id };
    render();
    return;
  }

  // No clash → straightforward move.
  site.clientId = targetClient.id;
  finishSiteAssign(targetClient.id);
}

// v26 (Q14=B): clash resolvers, called from the clash-choice sheet buttons.
function resolveAssignMerge() {
  const ad = state.clientsPage.assignDialog;
  const site = siteById(ad.siteId);
  const targetId = ad.clash && ad.clash.targetClientId;
  if (!site || !targetId) return;
  // Drop the moving site; the target's existing same-named site stands.
  state.sites = state.sites.filter(s => s.id !== site.id);
  finishSiteAssign(targetId);
}

function resolveAssignKeepBoth() {
  const ad = state.clientsPage.assignDialog;
  const site = siteById(ad.siteId);
  const targetId = ad.clash && ad.clash.targetClientId;
  if (!site || !targetId) return;
  site.name = nextFreeSiteName(targetId, site.name);
  site.clientId = targetId;
  finishSiteAssign(targetId);
}

function finishSiteAssign(expandClientId) {
  state.clientsPage.assignDialog = { siteId: null, name: '', clash: null };
  if (expandClientId) state.clientsPage.expandedClientId = expandClientId;
  save();
  render();
}

// v26: given a desired site name that clashes within a client, return the next
// free "<name> (n)" variant not already used by that client (case-insensitive).
function nextFreeSiteName(clientId, baseName) {
  const base = String(baseName || '').trim();
  let n = 2;
  let candidate = `${base} (${n})`;
  while (findSiteByName(clientId, candidate)) {
    n++;
    candidate = `${base} (${n})`;
  }
  return candidate;
}

// v16: transient toast — a small auto-dismissing pill at the bottom of the
// screen. Appended directly to <body> (outside #app) so it survives the next
// render() (which rewrites #app and sweeps stray sheets/backdrops, but leaves
// .toast alone). Self-contained: replaces any existing toast, fades in, then
// removes itself after a short delay. No state needed.
