# @mops backend: what's real, what it replaces, and what production would need

*Plain-English guide. All data is fictional (company name "Northwind Networks"). Nothing here uses real company data.*

## The one-minute version
@mops isn't just a screen. Behind it run **five separate services, each with its own database**. They talk to each other the way real enterprise systems do, through APIs, an event log, and SMTP for email. When you tag `@mops` (in the app, by CC'ing **mops@** on an email, or in a Webex room), the same agent runs the same calls across those services. The **Engine room** (`/engine`) shows this happening live.

| Service | Replaces | What it does for real |
|---|---|---|
| **Engine** (SQLite) | Eloqua, campaign ops spreadsheets, Cvent forms | Contacts, consent ledger, segments, email templates, sends, open/click tracking, unsubscribe, campaigns + codes, budgets + $150K approval rule, audit log, event registration, intent-signal scoring, CRM connector |
| **CRM**: fake SFDC (its own SQLite) | Salesforce (a stand-in for the demo) | A Salesforce-shaped REST API: external-ID upserts, a "changes since" feed, sales-user edits, API rate limit (429) and random outages (503) |
| **Mail** (real SMTP server on :2525) | The email delivery provider | Accepts every email over real SMTP and stores it, so nothing reaches a real person. Also receives email sent to **mops@mops.local** |
| **Warehouse** (SQLite, laid out like Snowflake) | Snowflake + Power BI/Tableau | An ELT job copies engine + CRM data into RAW tables, then rebuilds MART tables with SQL (campaign performance, multi-touch attribution, pipeline by channel, funnel, consent health). The insight agent answers from these tables. The hosted demo uses SQLite so it can run inside a Vercel function |
| **Hub** (inside the app, :8787) | Glue between all the tools: Zapier, MuleSoft, and the people who copy/paste | The append-only event log + workers, the single @mops entry point, the orchestrator, the self-healing autopilot, the "Covered for you" watcher, and the Engine room |

## How it works, step by step (the "Run full campaign" button)
Each line is a real API call. Times are from an actual run on the box.
1. `@mops new Zero Trust Roundtable, $180K`: the Engine creates the campaign and **generates the campaign code** (e.g. `FY27Q1-IND-EVT-0001`). $180K is over the $150K limit, so the budget is **routed for approval** and written to the audit log.
2. `@mops approve BR-0001` (Chris): the budget is approved and the campaign is queued for CRM.
3. The **CRM connector** pushes the campaign to the fake SFDC and gets back an SFDC-style Id.
4. `@mops segment CIOs, CTOs and CISOs in India, EMEA and US`: plain English becomes JSON rules, and the rules become a safe SQL query. Result: 60 people.
5. The Event page is created, with a hosted registration form (this replaces Cvent).
6. `@mops send the invite`: every person goes through a **consent check by law**. India (DPDP), EU (GDPR), Japan, ANZ and ASEAN need a recorded opt-in. The US (CAN-SPAM) allows email unless the person opted out. In the measured run, 43 people were emailed and 17 were blocked (9 had opted out, 8 had no consent). Every email carries a tracking pixel, tracked links and a signed one-click unsubscribe link.
7. Recipients engage. A script plays the role of the humans: it opens the emails, clicks the links and unsubscribes 2 people, all through the **real tracking and unsubscribe endpoints**. The consent ledger records the opt-outs, and future sends block them.
8. Registrations come in through the real form: contact → consent → campaign member → lead.
9. 6sense/Adobe-style intent arrives as a CSV and a webhook. Contacts are rescored, and anyone over 60 becomes an MQL.
10. CRM sync runs while 30% of calls fail on purpose. The connector retries with back-off, and anything that keeps failing goes to a **failure queue**.
11. Sales reps convert leads to opportunities in the CRM. The connector **pulls the changes back** and settles conflicts by rule: sales owns lead status and owner, marketing owns the score.
12. ELT loads the warehouse (about 2,000 rows into 13 RAW tables, then 5 MARTs, in about 0.1s).
13. `@mops how did the roundtable do?`: the answer comes from warehouse SQL, not a dashboard.

The whole run takes about **9s of machine time** (about 18s on screen with display pauses). The 2-minute target is met with a wide margin.

## Event-driven core
Every service publishes what it does (for example `engine.sync`, `crm.error`, `mail.inbound`) to **one append-only event log** (`bus.db`, numbered offsets). **Workers** subscribe, remember where they got to, retry 3 times, and then park bad events in a dead-letter table:
- `inbound-email`: an email to mops@ goes to the agent, and the reply is emailed back to the whole thread.
- `autopilot-healer`: when a sync job lands in the failure queue, it diagnoses the problem, waits for the CRM to recover, replays the job and verifies it.
- `warehouse-loader`: new registrations, uploads or syncs trigger a warehouse refresh.
- `cover-watcher`: business events trigger a "Covered for you" scan.

## One @mops, every surface
- **Email:** Srisha emails Chris and CCs `mops@mops.local` with "@mops new partner webinar in Japan, budget $60K". @mops creates the campaign (code, auto-approval at ≤$150K, CRM sync) and **emails a reply to Srisha with Chris on CC**, threaded with In-Reply-To. The action also shows up in the app thread and the Engine room.
- **Webex-style bot:** `POST /api/engine/webhooks/webex`, signed with HMAC-SHA1 like Webex's `X-Spark-Signature`. Unsigned calls are rejected.
- **App / Engine room:** `POST /api/engine/tag`.
All three go through the same `agent.handle()`, and a test checks that they give identical answers.

## Self-healing
"Inject CRM outage" makes the CRM return 503 for about 14s. The sync job uses up its retries and lands in the failure queue. The autopilot detects this, probes the CRM (holding retries so it doesn't waste API calls), sees it's healthy, replays the job, and checks that the failure queue is empty. Measured: **healed about 4s after detection, with no human involved**.

## "Covered for you" (acts without being asked, within risk limits)
| Trigger (found in the seeded data) | What @mops does | Undo |
|---|---|---|
| Event registrations behind pace (9/120, needs about 60) | Builds a segment of people who opened but didn't register, drafts a reminder and **schedules** the send. Consent is checked again at send time. Low risk only (≤200 people) | Cancels the send during the 2-minute window |
| MQL untouched by a seller for more than 48h | Emails the seller a nudge and reassigns the lead in CRM | Gives the lead back to the original owner |
| Campaign underspend (<60% spent) | Moves up to $25K (the delegated limit) to the campaign with the best pipeline per dollar, at most once a day. Bigger moves would only be suggested | Moves the money back |
| Upload rows with no consent in opt-in countries | Quarantines those rows and imports the clean ones | Releases the rows. They stay blocked from email anyway |
| Campaign missing in SFDC | Creates it in the CRM | Deletes it from the CRM |
| Event ended | Builds the report (attended, no-shows, MQLs, pipeline) and drafts a follow-up email (**not sent**) | Discards the draft |

Every item shows a before/after view and an Undo button in the Engine room, and is written to the audit log and the event stream.

## Scale test (measured on this box: 8 vCPU, one Node process, SQLite)
| Stage | Result |
|---|---|
| Seed 1,000,000 contacts + 1,000,000 consent rows | ≈264K contacts/s (3.8s); p95 per 50K-row batch 181ms |
| 50 segment queries over 1M rows | p50 40–46ms, **p95 47–65ms**; largest segment (750K) pulled in 2.4s |
| Consent checks | 750K checked (475K allowed, 275K blocked) at about 20M checks/s |
| **100,000 emails over real SMTP** to the sink | **3,134–3,276 emails/s across 2 runs, p50 38–39ms, p95 46–52ms, p99 57–71ms, 0 failures, 100,000 accepted** |

Honest caveats: this all runs over loopback on one machine. For load-test mail the sink receives the full SMTP message but only counts it; it doesn't parse or store it. Real sending is limited by the provider's IP reputation, not by our code (see below).

## 20x check, per task (`/api/engine/efficiency`)
**Measured** machine time comes from real runs. **Assumed** human minutes per task (time to read or approve) and **placeholder** baselines both come from `baselines.json`.
Budget 60x · Campaign code 90x · Sync fix 82x · Upload 40x · Segment+email 37x · Report 240x · Attribution 40x · Event 30x · **Overall about 49x.**
Every measured task clears 20x, but **the baselines are placeholders until Srisha gives real times**, and the human minutes are assumptions. Machine time is almost never the bottleneck.

## What's simulated (be upfront about this)
- The CRM is a Salesforce-shaped fake, not Salesforce. The behaviours (limits, outages, sales edits) are simulated on purpose.
- Email recipients and sales reps are played by scripts. They hit real endpoints, but they aren't people.
- Intent data is generated in 6sense/Adobe CSV and webhook format. It isn't a real feed.
- The agent uses rule-based intent matching. The LLM path exists in the app but has no key yet.
- Inbound email is SMTP-only (no IMAP). The Webex endpoint follows Webex's webhook and signature format but isn't connected to Webex.

## What a production build at scale would need
- **Snowflake instead of DuckDB:** same RAW → MART pattern, with dbt for models, Snowpipe or Fivetran for loading, and role-based access. The marts move over largely as-is.
- **Real Salesforce:** OAuth connected app, Bulk API 2.0 for big loads, Composite or REST for small changes, Change Data Capture or Platform Events instead of polling. Respect the **daily API limits**, which depend on edition and licenses (typically 100K+ per 24h). That's why the connector batches, backs off, and the healer stops retrying while the CRM is down.
- **Email deliverability:** an ESP (e.g. SES, SendGrid, SparkPost), dedicated IPs with **IP warm-up** over 2–6 weeks (start at a few thousand a day and ramp up), SPF/DKIM/DMARC, bounce and complaint handling, one-click unsubscribe (Gmail/Yahoo sender rules, RFC 8058), and suppression lists shared across all tools.
- **Consent law:** a legal review per country (DPDP rules in India, GDPR/ePrivacy, CAN-SPAM, Japan's Anti-Spam Act, Australia's Spam Act, Singapore's PDPA). Plus proof-of-consent retention, data-subject requests (access and erase), data residency, and a DPO sign-off. The consent ledger here is append-only for exactly this reason.
- **Identity and security:** SSO (SAML/OIDC through the corporate IdP), roles (marketer / approver / admin), secrets in a vault, encryption, audit retention, and a SOC2-style review. The approval rules move into a policy service.
- **Event core at scale:** Kafka, Kinesis or Pub/Sub in place of the SQLite log (same consumer-offset model). Postgres in place of SQLite for the engine. Containers on Kubernetes or Cloud Run, plus monitoring (OpenTelemetry).
- **Migration in stages:** run alongside Eloqua (read-only) → move segments and sends → move forms and events → switch off Eloqua. SFDC stays the system of record for sales.

## How to run
```
cd /workspace/moonshot/mops
npm install           # once
npm run demo          # boots all services, seeds fictional data → http://localhost:8787/engine
npm run demo:run      # same, then runs the full campaign once
npm run test:backend  # 15 backend integration tests (spins up its own stack on other ports)
npm run stop          # stop everything
```
API docs (OpenAPI): `/svc/engine/docs`, `/svc/crm/docs`, `/svc/mail/docs`, `/svc/warehouse/docs`.

## Round 4: Srisha's real times, enter once, Excel → SFDC (19 Oct 2026)
**Baselines (baselines.json, each task labelled):**
- Srisha's estimates: code 10 min, code + SFDC upload 15 min, budget 5 min, SOW 15–20 min.
- Assumptions: list upload 60–180 min (vendor sources, so we use the low end); post-event report 30 min hands-on plus a 72h agency wait.
- Placeholders: email, event, sync, attribution, budget shift and sellers. These are excluded from the headline.

**Enter once:** one message creates the campaign code, budget request, SFDC campaign, event ID, SOW and upload template in about 25 ms.

**Repeat entry:** today 57 field entries for 18 facts across 6 tools. With @mops it is 14 entries. The field-overlap mapping is an assumption.

**Excel → SFDC:** the app finds the header row, maps columns by name and by value, removes duplicates, quarantines bad rows and looks up owners (named account → AE, otherwise territory → SDR). Tested on 3 fictional files.

**Honest result:**
- Code 40x, code + SFDC 30x, upload 60x (assumption), report ~30x (assumption).
- **Budget 10x and SOW 8.8x are under 20x.**
- **End to end hands-on is 127.5 → 7 min = 18.2x, under 20x.**
- Srisha-estimated tasks only: 7.5x.
- Elapsed time including the agency wait: 74.1h → 7 min (≈635x).
- The @mops human minutes are assumed.

## Round 5: zero-touch budget, SOW smart prefill (19 Oct 2026)
**Budget: zero-touch.** @mops drafts the quarter's budget from three inputs: the pipeline goal, past ROI by channel from the warehouse, and the calendar. Each line comes with its reasoning, and the human taps Approve or adjusts. Review is assumed to take 15s.

**SOW: not zero-touch (Srisha's correction).** It works as smart prefill plus targeted questions plus human sign-off:
- **Derived, with a source shown for each field:**
  - dates and city come from the intake
  - SOW start/end are the event dates −30 / +14 days
  - currency comes from the country
  - signing authority comes from the threshold rules on amount and region
  - the agency comes from preferred-vendor history and is marked "suggested"
  - payment terms and the list deadline come from past SOWs
- **Asked in one @mops question:** confirm the agency, the venue if not booked, our PM, the agency PM, and the cost center if missing.
- **Sign-off:** it cannot be signed until the questions are answered, and it needs a named reviewer.
- **Review time:** assumed 3–5 min; 4 min is used in the calculation.

**Honest result:**
- **Under 20x:**
  - Budget 19.9x: 5 min vs 0.25 min plus about 0.01s of machine time, so just under 20x.
  - SOW 4.3x (range 3–6.7x).
- **End to end hands-on:** 127.5 → 8.77 min = **14.5x, under 20x**. This uses the 4 min SOW figure, so it does not assume a zero-touch SOW.
- **Srisha-estimated tasks only:** 37.5 → 6.77 min = 5.5x.
- **Elapsed time including the agency wait:** about 507x.
