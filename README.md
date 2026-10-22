# @mops

Field marketing demo. Run `npm start`, open http://localhost:8787/ , and sign in as Maria Alvarez. `/` is Maria's home. `/platform` is the console behind it. `/classic` is the older desk.

## Brand

The company wordmark is the `BRAND_NAME` environment variable. The default is `Northwind`. It is text only. There is no logo.

That name is used in the header, the sign-in page, reports (PowerPoint and PDF), email signatures and footers, registration pages, and the seed lines that record loading the fictional book.

Leave `BRAND_NAME` unset and the wordmark is Northwind. The company line is Northwind Networks. A name that already ends in "Networks" is used as the company line. Any other name gets " Networks" appended.

Mailbox addresses stay on `northwind.example`. That domain is the demo mail host, not the wordmark.

## Tag @mops from email or Webex

Outside testers can tag `@mops` from a real inbox or a Webex space. The ask runs through the Brain API in a workspace keyed to the sender. A Why row cites the email or the Webex message. The reply includes what changed and a link back to that workspace. The link expires after two hours. Another sender gets a different workspace.

This does not use the flipit.fyi domain and it does not need a DNS change. The mailbox is a free AgentMail inbox (`something@agentmail.to`). Webex developer bots are free on a personal account. Set the variables on the preview only. Leave `BRAND_NAME` unset.

Vercel Deployment Protection answers before the function runs, so a webhook cannot reach the preview until that protection is off for Preview. That is a project setting, not a DNS change. Leave production and flipit.fyi alone.

### Email, about three minutes

1. Create a free inbox at [agentmail.to](https://www.agentmail.to). No card and no custom domain. Copy the API key and the inbox address.
2. On the preview, set `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID` (the inbox id from AgentMail), `INBOUND_WEBHOOK_SECRET` (a random string you invent), and `MOPS_EMAIL_ALLOWLIST` (comma-separated sender addresses). An empty allow list rejects every sender.
3. Register a webhook on that inbox for `message.received`. URL: `https://<preview>/api/inbound/email`. Header: `x-mops-inbound-secret: <INBOUND_WEBHOOK_SECRET>`.
4. Send `@mops who can I email in Illinois` from an allowlisted address. The reply quotes the count and links to the workspace. `/platform/ops` lists the tag while that instance is warm.

`MOPS_APPROVER_EMAILS` is the allowlisted addresses that may approve. Everyone else is a marketer.

### Webex, about three minutes

1. Open [developer.webex.com/my-apps](https://developer.webex.com/my-apps), create a bot, and copy the bot access token and the bot email.
2. On the preview, set `WEBEX_BOT_TOKEN`, `WEBEX_BOT_EMAIL`, `MOPS_WEBEX_SECRET` (a random string you invent), and `MOPS_WEBEX_ALLOWLIST`.
3. Create the webhook (replace the token, the preview host, and the secret):

```bash
curl https://webexapis.com/v1/webhooks \
  -H "Authorization: Bearer $WEBEX_BOT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"mops","targetUrl":"https://<preview>/api/inbound/webex","resource":"messages","event":"created","secret":"<MOPS_WEBEX_SECRET>"}'
```

4. Add the bot to a space and send `@mops who can I email in Illinois`. The bot replies in the thread. The Why row cites Webex. The same line shows on `/platform/ops`.

The ops list lives on the instance that received the webhook. A cold start on Hobby has an empty list until the next tag. The email or Webex reply is the record that survives that. The sender workspace lives under `/tmp` on that instance and expires two hours after it was created.

## Workspaces

Open `/signup` to create a company workspace. The form asks for a company name, a brand color, an optional logo, and the admin's name, email, and passcode. A magic link is the other way in: it is sent from the free AgentMail inbox when `AGENTMAIL_API_KEY` is set. Each workspace is a separate book. Every row carries that workspace id, and every query is limited to it. The sample demo at `/` is unchanged.

The setup page is `/onboarding`. Upload a contacts file and a campaigns file (CSV or Excel; the columns are matched by their headers), or start from the sample book. Set the approver, the territory owner, and the send limit, then invite a teammate as a marketer or an approver.

Each workspace gets a plus-address on the same free inbox: `local+slug@agentmail.to`. Tag `@mops` at that address and the ask runs in that workspace. The Webex bot token, bot email, and webhook secret are optional fields on the setup page. A bot whose webhook secret matches that field replies in the workspace. No DNS change and no paid plan.

On Vercel Hobby the workspace file lives on the instance disk and does not survive a cold start. A free Postgres connection string can be added later as `PLATFORM_DATABASE_URL` with `PLATFORM_DB=postgres`. This preview does not require one.

Every account, person, and campaign in the demo is fictional.

## Webinar demo

Open `/webinar`, or use the Webinar demo button on the home page. The screen is a chat with @mops. Type an ask, or tap a suggestion under the box. Each reply shows a short working state, then the artifact.

The stage asks are the December statement of work (DOCX and PDF, with an on-screen Approve), the registration page and sample registrations, the campaign code and a mock campaign record, invite drafts that stay in the in-process catcher, a messy list that is cleaned, deduped, scored, and synced to the built-in CRM, a short list of fixes with a plain-language why and a source, and the pipeline report as PowerPoint and PDF.

Free-typed wording still lands on the same steps. The hunt and the account brief are still there if you ask for the 20 APAC manufacturers. Replay plays the recorded run if you press Replay, or if a request fails.

It runs with no API key. The answers are deterministic. If `MOPS_API_KEY` is set, the screen says so and still uses the same recorded rules, so a live room cannot stall on a model call.

The sample badge file has duplicates, bad casing, missing fields, and junk rows. Every company, registration, and campaign code is fictional. Notes stay in the catcher. Nothing is handed to a real inbox.

```bash
BRAND_NAME=Harborline npm start
```

The value is trimmed, limited to 40 characters, and stripped of control characters and `& < > " '`.
