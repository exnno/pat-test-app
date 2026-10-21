// PATGo cloud — V142 — billing-portal: the app's Manage billing / Update card → Stripe's billing page
// (c) 2026 Peter Birchley. All rights reserved.
// Everything it does is in ../_shared/billing.js (makePortal). Deployed with
// "Verify JWT" OFF: the function checks the person's sign-in itself (callerUser).
import { makePortal, denoDeps } from '../_shared/billing.js';

Deno.serve(makePortal(denoDeps()));
