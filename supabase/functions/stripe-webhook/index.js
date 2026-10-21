// PATGo cloud — V142 — stripe-webhook: Stripe telling us something changed → the business's plan
// (c) 2026 Peter Birchley. All rights reserved.
// Everything it does is in ../_shared/billing.js (makeWebhook). Deployed with
// "Verify JWT" OFF: Stripe signs its messages instead (checked first thing).
import { makeWebhook, denoDeps } from '../_shared/billing.js';

Deno.serve(makeWebhook(denoDeps()));
