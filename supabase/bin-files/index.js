// PATGo cloud — V172 — bin-files: the photo files of jobs gone for good from
// Recently deleted (after 30 days, or deleted for good by the Owner).
// (c) 2026 Peter Birchley. All rights reserved.
//
// Deployed with "Verify JWT" OFF: it takes no orders from the caller. It asks the
// database what is waiting (bin_files_due — the service key only), deletes those
// files from the photos bucket, and says they're done (bin_files_done). Nobody
// signed in may delete another person's files, so this is the one place it
// happens. The database asks for it (bin_files_nudge, hourly and on "Delete for
// good"); calling it any other time just finds nothing waiting, or does the same.
// One file, no imports: paste it as it is into the dashboard's editor.

function keys(env) {
  const pick = (name) => {
    try { const o = JSON.parse(env(name) || '{}'); return o && o.default ? o.default : ''; } catch { return ''; }
  };
  return {
    url: String(env('SUPABASE_URL') || '').replace(/\/+$/, ''),
    secret: pick('SUPABASE_SECRET_KEYS') || env('SUPABASE_SERVICE_ROLE_KEY') || '',
  };
}
// A new-style key (sb_…) goes on apikey only; an old JWT key on both headers.
function keyHeaders(key) {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, authorization: 'Bearer ' + key };
}
async function rpc(deps, name, args) {
  const k = keys(deps.env);
  const res = await deps.fetch(`${k.url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, keyHeaders(k.secret)),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`database ${name}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
// Storage's own delete (the files and the rows behind them, together).
async function removeFiles(deps, paths) {
  const k = keys(deps.env);
  const res = await deps.fetch(`${k.url}/storage/v1/object/photos`, {
    method: 'DELETE', headers: Object.assign({ 'content-type': 'application/json' }, keyHeaders(k.secret)),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`storage: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// Each waiting job's files, then that job marked done. A job whose delete fails
// stays waiting; the next call tries it again. A file already gone is not an error.
export async function binFilesRun(deps) {
  const due = await rpc(deps, 'bin_files_due', {});
  const done = [];
  let failed = 0;
  for (const d of Array.isArray(due) ? due : []) {
    const paths = (Array.isArray(d.paths) ? d.paths : []).filter((p) => typeof p === 'string' && p);
    try {
      for (let i = 0; i < paths.length; i += 100) await removeFiles(deps, paths.slice(i, i + 100));
      done.push(d.n);
    } catch (e) {
      failed++;
      console.error('bin-files', d.n, e && e.message);
    }
  }
  if (done.length) await rpc(deps, 'bin_files_done', { entries: done });
  return { done: done.length, failed };
}

export function makeBinFiles(deps) {
  return async (req) => {
    const out = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
    if (req.method !== 'POST') return out({ error: 'POST only' }, 405);
    try { return out(await binFilesRun(deps), 200); }
    catch (e) { console.error('bin-files', e && e.message); return out({ error: 'try again' }, 500); }
  };
}

if (typeof Deno !== 'undefined') {
  Deno.serve(makeBinFiles({ env: (k) => Deno.env.get(k), fetch: (...a) => fetch(...a) }));
}
