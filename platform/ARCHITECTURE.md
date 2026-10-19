# Northwind Marketing Cloud

One local platform replaces the marketing tool stack. `npm start`, then sign in and open `/platform`. The store is SQLite. `PLATFORM_DB=postgres` plus `PLATFORM_DATABASE_URL` selects the Postgres driver in `platform/db.js`. The same migrations run, with `BIGSERIAL` and `$1` placeholders.

## What replaces what

Data core replaces Snowflake marts and Airtable trackers. Built. Console at `/platform/data`.

Engage replaces Eloqua. Built. Console at `/platform/engage`.

CRM bridge replaces the Salesforce connector. Built. Console at `/platform/crm`.

Plan and spend replaces Command Center and Airtable. Built. Console at `/platform/spend`.

Insights replaces Power BI and Tableau. Built. Console at `/platform/insights`.

Brain API is the tag, the policy, and the why feed across every module. Built. Console at `/platform/brain`. The ask box at `/platform/ask` routes every module.

## Asks a marketer actually sends

Data core, running now:

- @mops who can I email in Illinois
- @mops show me the Chicago campaign
- @mops why did the Chicago venue change
- @mops how many opted-in contacts are in each region
- @mops hold the German contacts who have no consent

Engage, running now:

- @mops send the Chicago invite to CIOs in Illinois who opened last month
- @mops draft a Chicago invite
- @mops who is an MQL on the Chicago invite
- @mops enroll clickers who have not registered into the Chicago nurture
- @mops what is the open rate on the Chicago invite

CRM bridge, running now:

- @mops upload this attendee file to SFDC for the Chicago roundtable
- @mops upload this attendee file
- @mops who owns the Chicago accounts
- @mops sync the Chicago campaign to Salesforce
- @mops show the sync failures

Plan and spend, running now:

- @mops new budget: Chicago security roundtable, $180K
- @mops file the Chicago budget
- @mops mint the campaign code
- @mops draft the SOW
- @mops what is left in the Americas budget

Insights, running now:

- @mops weekly report for Americas
- @mops monthly report for the portfolio
- @mops what is the cost per lead for Chicago
- @mops how much pipeline did Chicago source

Brain API, running now:

- @mops what changed on the Chicago roundtable
- @mops what is the approval policy
- @mops approve Chicago

The ask box is the channel test. App, Email, and Webex are the same call. The human types the sentence. The module fills everything a human does not uniquely know. A registration form still asks for name, email, and consent. The SOW still asks for three fields only a person knows: our project manager, the purchase order, and the day-of venue contact.

## How a tagged ask finishes

One Chicago send writes the segment (CIO, Illinois, opened in the 30 days before 19 Oct 2026, opted in), reuses the invite, merges first name and company, and delivers into the local mail catcher. Contacts without opted-in consent are held. The open pixel and the click redirect write activities. Fit plus behaviour becomes the score. A lead becomes an MQL at 70. Opens stay under that line. A click crosses it. A simulated response is about 45% open and about 12% click, and only the clickers cross the line. The nurture then enrolls clickers who have not registered, sends the first note, and waits 48 hours before the next one.

The attendee upload reads `platform/samples/chicago-attendees.xlsx`. Junk rows sit above the header. Owners are the territory AE for an executive title and the territory SDR otherwise. Held rows are listed with a reason: no consent, missing email, duplicate, and a formula in a cell. A held row is not loaded. Nina Vale is the duplicate, so she is held and she is not a campaign member. The same counts are in the ask, on the CRM page, and in the why feed. Jake Moss owns the Chicago accounts. Rosa Diaz is assigned by the SDR rule and owns none of those accounts. The campaign object is written once. Salesforce was busy, retried automatically, and the queue finishes clear.

The Chicago budget of $180,000 is over $150,000, so Maria's request is Waiting on Chris. It does not approve itself. Chris M. approves it from `/platform/spend`, or with `@mops approve Chicago` while signed in as Chris. The BAN and the campaign code are minted then. $150,000 is approved by the policy. $150,001 waits for Chris M. The SOW is filled from the agency roster. Open items read Waiting on you: PM, PO, venue contact. Saving those three confirms Saved, SOW ready for review and leaves the values on the form. Actuals stay hidden until Chris approves. Chicago actuals are $0 right after approval.

The weekly report reads the live region and program totals. The deck states a pipeline target that is not the actual pipeline. The reply offers Download PowerPoint and Download PDF.

The venue change is one why row, tagged with the Chicago security roundtable. The why answer names the source as Jordan Hale's email, 14 Oct. Reset demo wipes the book back to that seed, so the home feed, the Brain feed, and the next ask are a first run.

## Old tool vs @mops

Each console shows one measured line, labeled Old tool vs @mops. A run under a second reads <1 sec.

Data core: 6 screens, 11 fields, 20 minutes in Snowflake and Airtable for one consented list. The console shows the measured seconds for `@mops who can I email in Illinois`.

Engage: 9 screens, 16 fields, 35 minutes in Eloqua to build that segment, the email, and the send. The console shows the measured seconds for the Chicago invite ask.

CRM bridge: 8 screens, 14 fields, 25 minutes in Salesforce to map a badge export, assign owners, and load campaign members. The console shows the measured seconds for the Chicago upload ask.

Plan and spend: 7 screens, 18 fields, 40 minutes in Command Center and Airtable for the budget, the approval, the BAN, the code, and the SOW. The console shows the measured seconds for the $180K Chicago ask.

Insights: 5 screens, 9 fields, 30 minutes in Power BI for a weekly regional deck and an export. The console shows the measured seconds for `@mops weekly report for Americas`.

Brain API: 11 screens, 22 fields, 45 minutes to check policy and the why across the old tools. The console shows the measured seconds for `@mops what changed on the Chicago roundtable`.

Those minutes are an operator baseline for the old tools, not a stopwatch of a Northwind employee. The seconds are the median of real runs stored in `ask_runs`. Reads on the seeded book (5,000 contacts, 300 accounts, 40 campaigns, four regions) stay under 300ms.

## Enterprise path

This demo is one SQLite file, fictional Northwind data, and the demo sign-in. Production is the same modules with a harder edge:

SSO via OIDC. The demo picker uses the same session interface. `MOPS_OIDC_ISSUER` switches the provider.

RBAC. Marketer, approver, and admin, each scoped to a region. Admin is not on the demo picker.

Encryption at rest. The database volume is encrypted. A Postgres deployment uses the provider's disk encryption. The demo file is local SQLite and is not a pretend cipher.

Regional data residency. A deployment sets `PLATFORM_REGION` and serves that region's rows. The demo keeps Americas, EMEA, APJ, and Global in one file so the consoles can be shown together.

Audit. Every write is an append-only event with actor, channel, source message, and why. The log is not updated in place.
