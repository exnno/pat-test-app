// PATGo cloud — V169 — billing-seats: the seat count → Stripe, and the Owner told
// (c) 2026 Peter Birchley. All rights reserved.
// Everything it does is in ../_shared/billing.js (makeSeats). Deployed with
// "Verify JWT" OFF: it takes no orders from the caller — it only ever makes
// Stripe match the database and tells the Owner what the database wrote down.
import { makeSeats, denoDeps } from '../_shared/billing.js';

Deno.serve(makeSeats(denoDeps()));
