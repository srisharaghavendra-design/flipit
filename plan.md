# @mops v2: the field marketing platform you use by tagging it
Fictional company **Northwind Networks**, all dummy data (40 accounts, 300 contacts, 10 campaigns, 220 leads). No real customer data or logos.

## Run
```
cd /workspace/moonshot/mops
node seed.js          # (optional) regenerate dummy data -> data.seed.json + data.json
node server.js        # http://localhost:8787  (zero npm deps, Node 20)
```
- **AI mode:** `MOPS_API_KEY=... MOPS_API_BASE=https://api.x.ai/v1 MOPS_MODEL=grok-4 node server.js` (or the OpenAI base URL and gpt-4.1). If the AI call fails, it falls back to rule mode.
- **Email:** messages stay in the in-process catcher. The demo never sends real email. An `MOPS_SMTP_URL` is ignored.
- **Nurture timing:** `MOPS_DAY_MS=10000` makes 1 "day" last 10s for demos, or use "Fast-forward nurture" in the Data panel.
- **Reset:** the button in the UI, or `POST /api/reset`.
- **Tests:** with the server running, run `python3 tests/e2e.py` (22 API and Playwright checks, writes shots/). `tests/mock_llm.js` is a fake AI endpoint for testing the tool-calling loop.

## Architecture
```
Thread UI (tag @mops) ──POST /api/post──> router
   ├─ MOPS_API_KEY set → LLM (OpenAI-compatible tool calling, ≤6 rounds, thread history as context)
   └─ no key          → rule router (regex intent), calls the SAME tools
                              │
 agents.js  ── Email agent (Eloqua):   build_segment · draft_email · send_email (consent suppression, pluggable sender) · schedule_nurture
            ── Insight agent (BI):     query_insight → computed totals + Chart.js spec + cited record IDs
            ── Ops agent:              create_campaign_code (+mock CRM sync) · budget_request ($150K threshold) · decide_budget · generate_sow (.doc/.html) · clean_upload · mdf_status
            ── Event agent (Cvent):    create_event → hosted /r/<slug> registration page → contacts/leads/thread · event_status
                              │
 ONE data layer: data.json {accounts, contacts+consent, campaigns+codes+budgets, leads, events+registrations, mdf, budgets, sows, segments, emails, outbox(opens/clicks), sequences, uploads, crmSync, threads}
```
Every result is saved as an artifact on its thread. Context comes from the thread, so nothing gets typed twice: the region feeds the segment, the campaign code feeds the email, SOW and event, and the budget and pipeline feed the justification. The "Stack replaced" panel maps each legacy tool to the module that covers it. Endpoints: /api/state, /api/thread/:id, /api/post, /api/tool, /api/budget/:id/approve|reject, /api/nurture/run, /api/outbox, /api/data, /sow/:id.doc, /r/:slug, /t/o|c/:msgId (open/click tracking).

## Limits (honest)
Opens and clicks are simulated at send; the tracking endpoints are real but only fire locally. The CRM is a mock sync log. The .doc is Word-compatible HTML, not native docx. A JSON store is fine for a demo but would need a real database to scale. The real AI has not been tested yet (no key); the loop was checked with a mock endpoint.

## Next
1. Add the AI key and test with real prompts. 2. Hosting (Render/Fly; needs an account and the user's OK). 3. Email-in channel via the bot inbox (needs approval).

## v3 (18 Oct)
New tags: sync doctor (#6, `diagnose_sync`), who's hot (#7, `lead_score`, uses mock 6sense + Adobe), attribution (#8, `credit_campaign`), target list to sellers (#10, `push_target_list`). Autopilot: `autopilot_tick` runs every 60s (`MOPS_AUTOPILOT_MS`, disable with `MOPS_AUTOPILOT=0`; manual `POST /api/autopilot/run` or `@mops autopilot`), approvals via `@mops approve FU-xxx|SH-xxx`. Demo threads: T-A141 Acme Corp. Tests: 47 checks (`MOPS_AUTOPILOT=0 node server.js` then `python3 tests/e2e.py`). Brief: architecture-brief.md. Backups of v2 files are in old/.

## v4 UI (18 Oct night)
New frontend: one feed (brief → Needs you cards with Approve / Edit / Not now → handled-for-you stream), artifacts open in a bottom sheet, single composer with mic (Web Speech API) and context chips, campaign/account switcher chips, live thinking steps, dark default + light mode, mobile layout. Admin views (tools replaced, data layer, outbox, reset) moved behind the ⋯ menu. Old UI in old-ui/. Backend unchanged except /api/data now also returns followups and shifts. Autopilot fix: stages are computed after the auto ops and tick in order (a later stage can't tick before earlier ones). Tests: 47/47 in tests/e2e.py; screenshots via tests/ui2_shots.py → shots/ui2_*.png.


## v5 backend (19 Oct)
Real multi-service backend: see backend.md. `npm install && npm run demo` → http://localhost:8787/engine. Tests: `npm run test:backend` (15/15) + tests/e2e.py + tests/efficiency_test.py still pass. Screenshots: shots/engine_*.png (tests/engine_shots.py).
- v6 (19 Oct): round 4 real baselines; honest result: end to end 18.2x, budget and SOW under 20x. See backend.md.
- v7 (19 Oct): budget zero-touch (19.9x); SOW is smart prefill + questions + sign-off (4.3x); end to end 14.5x. See backend.md.
