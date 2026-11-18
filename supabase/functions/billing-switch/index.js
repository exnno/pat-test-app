// PATGo cloud — V169 — billing-switch: the app's Switch to yearly / monthly
// (c) 2026 Peter Birchley. All rights reserved.
// Everything it does is in ../_shared/billing.js (makeSwitch). Deployed with
// "Verify JWT" OFF: the function checks the person's sign-in itself (callerUser).
import { makeSwitch, denoDeps } from '../_shared/billing.js';

Deno.serve(makeSwitch(denoDeps()));
