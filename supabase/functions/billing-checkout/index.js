// PATGo cloud — V142 — billing-checkout: the app's Subscribe → a Stripe payment page
// (c) 2026 Peter Birchley. All rights reserved.
// Everything it does is in ../_shared/billing.js (makeCheckout). Deployed with
// "Verify JWT" OFF: the function checks the person's sign-in itself (callerUser).
import { makeCheckout, denoDeps } from '../_shared/billing.js';

Deno.serve(makeCheckout(denoDeps()));
