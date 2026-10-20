# Put the Northwind demo on www.flipit.fyi

The site already lives on the free Vercel project that serves flipit.fyi. You do not buy a new host, and you do not change DNS. Merging the pull request replaces the old FlipIt pages with this demo.

Email in the demo is caught inside the app. It is never sent to a real inbox.

The wordmark is the `BRAND_NAME` environment variable. The default is Northwind. Set it on the host when this deployment should show a different fictional name. There is no logo. Mailbox addresses stay on `northwind.example`.

## What you click

1. Open the pull request on GitHub.
2. If it says **Draft**, click **Ready for review**.
3. Click **Merge**. Vercel deploys the production branch by itself. Wait until the Vercel check on that commit is green.
4. Open https://www.flipit.fyi/ . You should see a demo sign-in page, not the old FlipIt site.
5. Pick a demo user (the page says it is a demo). Chris M. is the approver. Open `/engine` as well.
6. Send your boss https://www.flipit.fyi/ and tell them to use the demo sign-in picker.

That is the whole launch. No Render account, no card, no nameserver change.

## Sign-in

There is no shared passcode. The page is a demo user picker, labelled as a demo. Each user has a role (marketer, approver, or admin) and a region. The session cookie is random, HttpOnly, and expires. It is not derived from a password printed on the page.

Optional, if you later attach the company identity provider:

- OIDC: set `MOPS_OIDC_ISSUER`, `MOPS_OIDC_CLIENT_ID`, and `MOPS_OIDC_CLIENT_SECRET`. Without the secret, that path fails closed.
- SAML: set `MOPS_SAML_ENTRY`.
- Session signing: set `MOPS_SESSION_SECRET` to a long random value. If you leave it unset, the process generates one at boot. A cold start then signs people out.

Do not add an email password, SMTP host, or API key. The demo must not send real email.

`MOPS_API_KEY` is optional. Leave it blank. The app then uses its built-in rules, which is what the screens were written for. If you add a key later, also set `MOPS_API_BASE` and `MOPS_MODEL`. If the key fails, the app falls back to rules.

## What Vercel must already be

These match the project that serves flipit.fyi today. You should not have to change them. If a new project was created by mistake, point it at this repo and the production branch, and leave the existing domain attached to the old project instead of this checklist.

| Setting | Value |
|---|---|
| Framework | Other. Leave it. Do not switch the project to a new framework |
| Root directory | repository root, not `legacy/flipit` |
| Node.js version | 20 or newer. `package.json` must say `>=20`. This project rejects `"node": "20.x"` and fails the deployment before the build starts. The tests run on Node 20 |
| Build | none. Vercel installs dependencies and publishes `api/index.js` |
| Output | leave the output directory as this project already has it. `public/index.html` is only there so that folder is not empty; `vercel.json` sends every path to the function |
| Production branch | the branch Vercel already deploys for flipit.fyi (normally `main`) |
| Function timeout | 60 seconds, set on `api/index.js` in `vercel.json`. That is the value this Hobby project already used for its functions |
| Pull request comments | `github.silent` is on in `vercel.json`, so Vercel deploys the preview without posting a comment on the pull request |
| Domain | `flipit.fyi` and `www.flipit.fyi` stay attached. Do not edit DNS |

DNS today, which you leave alone:

- `www` is a CNAME to `660f5e4b2083e49a.vercel-dns-017.com`
- `flipit.fyi` is an A record to `216.198.79.1`
- Mail forwarding (MX and the SPF TXT record) stays as it is

## What is real on the free plan, and what is limited

The Engine room, campaign run, CRM sync, consent checks, registration forms, the Webex-style webhook, inbound `@mops` email, the warehouse queries, and "Covered for you" all run for real inside one Vercel function. Data sits in SQLite under `/tmp` and is loaded the first time a cold instance starts.

Limits, because Hobby does not keep a server running:

- State lasts while that instance is warm. A cold start loads the fictional book again. Two instances at once can each have their own copy. Do not treat it as a shared database.
- The scale-test button uses **2,000 contacts and 200 messages** (cap 8,000 / 800), labelled on the button. It is not the million-row run. The card shows the measured rate after it finishes. On a development machine that same Hobby size finished in 37ms (catcher accepted 200 of 200; segment query p95 was 0.07ms). The 8,000 / 800 cap finished in 76ms. A full campaign run in the test suite took about 7 seconds, and the self-heal test took about 25 seconds. The function is allowed 60 seconds and 1 CPU, so both fit. Expect the live site to be slower than that machine.
- A full campaign run is one request, up to 60 seconds, then the page shows the result.
- "Covered for you" runs when you open that card or press Scan now. It does not tick in the background after you leave.
- Rate limits are per instance, in memory: 4 scale-test clicks per 10 minutes from one address, plus a general cap. The limit uses the socket address. It does not trust `X-Forwarded-For` unless `MOPS_TRUST_PROXY` or Vercel is set, and then it uses the last hop.

## Roll back to FlipIt

The old site is still in the folder `legacy/flipit`. It is not served.

Fastest rollback, no code:

1. Vercel → this project → **Deployments**.
2. Find the last deployment from before this merge (the old FlipIt site).
3. Open it → **Promote to Production** (or the three-dot menu → **Promote**).

`www.flipit.fyi` goes back to FlipIt. DNS does not change.

To roll back in git as well: on the pull request, click **Revert**, then merge the revert. The next production deploy is FlipIt again.

The old Render / Docker files are gone on purpose. Do not add a paid host for this demo.

## Preview only: email and Webex

The private preview can take a tag from email or Webex. Do not point either of those at flipit.fyi, and do not change DNS. Use a free AgentMail inbox and a free Webex bot. The steps are in the README section "Tag @mops from email or Webex". Set `INBOUND_WEBHOOK_SECRET`, `MOPS_EMAIL_ALLOWLIST`, and the Webex variables on the Preview environment only. Leave `BRAND_NAME` unset. Turn off Deployment Protection for Preview or the webhook never reaches the function. Production mail stays in the in-process catcher.

## Preview only: workspaces

`/signup` creates a company workspace on the preview. It uses the same free AgentMail inbox, with a plus-address per company, and an optional Webex bot token on the setup page. Do not buy Postgres for this. The books are sqlite files on the instance. Leave `BRAND_NAME` unset so the sample demo stays Northwind. A workspace paints its own name and color.
