/* Standing test — V169.1 (hotfix): what accepting costs, said plainly; the Subscription
   page no longer stuck waiting on a closed Stripe window; Resend's reason kept.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 18 Nov, after his live test of V169: (1) "make it clear that on acceptance this
   adds a cost as you go through no new checkout"; (2) "the subscription page gets stuck
   on your billing account is open in the stripe window … you have to swap pages if
   you've closed the stripe window"; and no email arrived — the test project's
   seat_changes said "email 403" (Resend refused) with no reason.

     110a  the words: the name sheet and "Invite sent" — accepting adds the seat by itself,
           no checkout; monthly: the next bill; yearly: the rest of the year (about £X)
           charged that day; who is emailed (you / the owner); the trial; Office and
           comped nothing. The joiner: the business pays, nothing for them to pay.
     110b  the wait: a Stripe window seen closed ends it within a second; PATGo back in
           front (focus / visible) ends it — not in the first moment after the tap;
           never the switch; the button says Done; the plan read again.
     110c  the server keeps Resend's own reason in the result.
     110d  release: cache pat-v169-1; APP_VERSION stays V169 (a hotfix). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick } = require('../fixture');
const H = require('./109-v169.js').helpers;
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

module.exports = async function () {
  await t.group('110a — accepting adds the seat by itself, no checkout: said on the invite, on "Invite sent" and to the joiner', async () => {
    const app = await H.signedIn();
    const line = app.fn('businessInviteCostLine');
    H.setBiz(app, null, [H.seatRow({ every: 'month' })]);
    t.eq(line(H.OWN, 'engineer'), ' When they accept, a £3 a month seat is added to your plan straight away — there’s no checkout or payment page. Stripe adds it to the next bill. You’re emailed about it.', 'monthly, the Owner inviting');
    H.setBiz(app, null, [H.seatRow({ every: 'year', period_end: H.iso(Date.now() + 73 * H.DAY + 3600000) })]);
    t.includes(line(H.OWN, 'team_leader'), 'a £30 a year seat is added to your plan straight away — there’s no checkout', 'yearly: £30 a year');
    t.includes(line(H.OWN, 'team_leader'), 'The rest of this year (about £6) is charged to the card on file that day.', '…the part-year in pounds (73 of 365 days of £30 = £6 — 2A)');
    H.setBiz(app, [{ id: H.OWN, name: 'Birchley Testing', role: 'team_leader', def: true, n: 3 }], [H.seatRow({ is_owner: false, every: 'month' })]);
    t.includes(line(H.OWN, 'engineer'), 'added to Birchley Testing’s plan', 'a Team leader inviting: the business’s plan');
    t.includes(line(H.OWN, 'engineer'), 'The owner is emailed about it.', '…the owner emailed');
    H.setBiz(app, null, [H.seatRow({ plan: 'trial', billed: false, every: null })]);
    t.eq(line(H.OWN, 'engineer'), ' A paid seat: free during the trial, then £3 a month on your plan — added by itself, no checkout.', 'the trial');
    t.eq(line(H.OWN, 'office'), '', 'Office: nothing (free)');
    H.setBiz(app, null, [H.seatRow({ plan: 'comped', billed: false })]);
    t.eq(line(H.OWN, 'engineer'), '', 'comped: nothing');
    // "Invite sent" says it again.
    H.setBiz(app, null, [H.seatRow({ every: 'month' })]);
    app.sheets = [];
    app.srv.fetchImpl0 = app.sandbox.fetch;
    app.sandbox.fetch = async (u, i) => String(u).endsWith('/rpc/invite_member') ? H.json('aaaaaaaa-0000-4000-8000-0000000000ff') : app.srv.fetchImpl0(u, i);
    await app.fn('businessInviteSend')(H.OWN, 'engineer', 'Jo', 'jo@x.co');
    const sent = app.sheets.find(s => s.title === 'Invite sent');
    t.ok(sent, 'Invite sent');
    t.includes(sent && sent.message, 'When they accept, a £3 a month seat is added to your plan straight away — there’s no checkout or payment page.', '…with the cost, at the moment it’s real');
    app.sheets = [];
    await app.fn('businessInviteSend')(H.OWN, 'office', 'Kim', 'kim@x.co');
    t.notOk(/seat is added/.test(app.sheets[0].message), 'Office invited: no cost said');
    app.sandbox.fetch = app.srv.fetchImpl0;
    // The joiner.
    const inv = { id: 'aaaaaaaa-0000-4000-8000-0000000000aa', business_id: H.OWN, business_name: 'Acme Testing', role: 'engineer', invited_by_name: 'Sam', expires_at: H.iso(Date.now() + H.DAY) };
    const real = app.fn('businessMyInvites');
    app.sandbox.businessMyInvites = () => [{ id: inv.id, org: inv.business_id, orgName: 'Acme Testing', role: 'engineer' }];
    app.sheets = [];
    app.fn('businessJoinStart')(inv.id);
    t.includes(app.sheets[0].message, 'Joining as Engineer adds a paid seat to Acme Testing’s PATGo plan — Acme Testing pays for it; there’s nothing for you to pay.', 'the joiner: the business pays');
    app.sandbox.businessMyInvites = () => [{ id: inv.id, org: inv.business_id, orgName: '', role: 'team_leader' }];
    app.sheets = [];
    app.fn('businessJoinStart')(inv.id);
    t.includes(app.sheets[0].message, 'adds a paid seat to the business’s PATGo plan — the business pays for it', '…no name: the business');
    app.sandbox.businessMyInvites = () => [{ id: inv.id, org: inv.business_id, orgName: 'Acme Testing', role: 'office' }];
    app.sheets = [];
    app.fn('businessJoinStart')(inv.id);
    t.notOk(/paid seat/.test(app.sheets[0].message), 'joining as Office: nothing about a seat');
    app.sandbox.businessMyInvites = real;
  });

  await t.group('110b — the Stripe wait ends by itself: the window seen closed, or PATGo back in front; Done', async () => {
    const app = await H.signedIn();
    app.sandbox.billingAvailable = () => true;
    const wait = (kind, ago) => app.run(`state.billing = state.billing || {}; state.billing.pending = '${kind}'; state.billing.uid = cloudUserId();
      _billWindow = { closed: false, close() { this.closed = true; } }; _billSince = Date.now() - ${ago}; _billWatch();`);
    // Closed → within a second.
    wait('portal', 0);
    app.srv.calls.length = 0;
    app.run('_billWindow.closed = true');
    t.ok(await H.until(() => app.run("state.billing.pending") === '', 2500), 'the window seen closed: the wait ends within a second');
    t.ok(await H.until(() => app.srv.rpc('my_billing').length >= 1), '…and the plan is read again');
    // Back in front, window still "open" (a phone that can't tell): after the first moment.
    wait('checkout', 5000);
    t.eq(app.fn('_billOnBack')(), true, 'PATGo back in front: the wait ends');
    t.eq(app.run("state.billing.pending"), '', '…nothing left waiting');
    wait('portal', 500);
    t.eq(app.fn('_billOnBack')(), false, 'in the first moment after the tap (Stripe still opening): keeps waiting');
    app.run('_billWindow.closed = true');
    t.eq(app.fn('_billOnBack')(), true, '…unless the window is already closed');
    app.run("state.billing.pending = 'switch'");
    t.eq(app.fn('_billOnBack')(), false, 'the switch (no window) is never ended this way');
    app.run("state.billing.pending = ''");
    // Listeners and the button.
    const plan = read('plan.js');
    t.includes(plan, "window.addEventListener('focus', _billOnBack); window.addEventListener('pageshow', _billOnBack);", 'focus and pageshow end the wait');
    t.includes(plan, '  try { _billOnBack(); } catch (e) { /* nothing waiting */ }', '…and coming back visible');
    const help = read('render-help.js');
    t.includes(help, 'data-action="billing-cancel-wait" style="margin-top:6px">Done</button>', 'the button says Done');
    t.includes(help, 'Close it when you’re finished — this page updates by itself.', 'the wait says it updates by itself');
  });

  await t.group('110c — the server keeps Resend’s reason', async () => {
    const B = await H.server();
    const d = H.deps();
    d.fetch = async (url) => url.startsWith('https://api.resend.com/')
      ? new Response(JSON.stringify({ statusCode: 403, message: 'The patgo.co.uk domain is not verified.', name: 'validation_error' }), { status: 403 })
      : new Response('null', { status: 200 });
    const r = await B.sendEmail(d, 'o@x.co', { subject: 's', text: 't' });
    t.eq(r.why, 'email 403: The patgo.co.uk domain is not verified.', 'the reason kept');
    t.notOk(r.final, '…and tried again later (put right in Resend → it goes)');
    d.fetch = async () => new Response('', { status: 500 });
    t.eq((await B.sendEmail(d, 'o@x.co', { subject: 's', text: 't' })).why, 'email 500', 'no body: the status alone');
  });

  await t.group('110d — release: cache pat-v169-1; APP_VERSION stays V169 (a hotfix)', () => {
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v169-1';", 'cache pat-v169-1');
    t.includes(read('config.js'), "const APP_VERSION = 'V169';", 'APP_VERSION V169');
  });
};
