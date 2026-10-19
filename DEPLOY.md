# Put the Northwind demo on www.flipit.fyi

The site already lives on the free Vercel project that serves flipit.fyi. You do not buy a new host, and you do not change DNS. Merging the pull request replaces the old FlipIt pages with this demo.

Email in the demo is caught inside the app. It is never sent to a real inbox.

## What you click

1. Open the pull request on GitHub.
2. If it says **Draft**, click **Ready for review**.
3. Click **Merge**. Vercel deploys the production branch by itself. Wait until the Vercel check on that commit is green.
4. Open https://www.flipit.fyi/ . You should see a passcode page, not the old FlipIt site.
5. Enter the passcode (see below) and open `/engine` as well.
6. Send your boss https://www.flipit.fyi/ and the passcode.

That is the whole launch. No Render account, no card, no nameserver change.

## Passcode

The only setting you should add is optional.

- If you set nothing, the passcode is **northwind**. The login page says this out loud. Fine for a private rehearsal. Change it before a wider audience.
- To choose your own: Vercel → this project → **Settings** → **Environment Variables** → add `DEMO_PASSCODE`. Put the same value on **Production** (and Preview, if you want the preview link locked too). Type a short phrase you can say in the meeting. Save, then **Deployments** → the latest production deployment → **Redeploy**.

Do not add an email password, SMTP host, or API key. The demo must not send real email.

`MOPS_API_KEY` is optional. Leave it blank. The app then uses its built-in rules, which is what the screens were written for. If you add a key later, also set `MOPS_API_BASE` and `MOPS_MODEL`. If the key fails, the app falls back to rules.

## What Vercel must already be

These match the project that serves flipit.fyi today. You should not have to change them. If a new project was created by mistake, point it at this repo and the production branch, and leave the existing domain attached to the old project instead of this checklist.

| Setting | Value |
|---|---|
| Framework | Other (no framework). `vercel.json` in the repo sets this |
| Root directory | repository root, not `legacy/flipit` |
| Node.js version | 20.x (from `package.json`) |
| Build | none. Vercel installs dependencies and publishes `api/index.js` |
| Output | the function in `api/index.js`. Do not set an output directory |
| Production branch | the branch Vercel already deploys for flipit.fyi (normally `main`) |
| Function timeout | 300 seconds, set in `vercel.json` (the longest the free Hobby plan allows) |
| Domain | `flipit.fyi` and `www.flipit.fyi` stay attached. Do not edit DNS |

DNS today, which you leave alone:

- `www` is a CNAME to `660f5e4b2083e49a.vercel-dns-017.com`
- `flipit.fyi` is an A record to `216.198.79.1`
- Mail forwarding (MX and the SPF TXT record) stays as it is

## What is real on the free plan, and what is limited

The Engine room, campaign run, CRM sync, consent checks, registration forms, the Webex-style webhook, inbound `@mops` email, the warehouse queries, and "Covered for you" all run for real inside one Vercel function. Data sits in SQLite under `/tmp` and is loaded the first time a cold instance starts.

Limits, because Hobby does not keep a server running:

- State lasts while that instance is warm. A cold start loads the fictional Northwind data again. Two instances at once can each have their own copy. Do not treat it as a shared database.
- The scale-test button uses **2,000 contacts and 200 messages** (cap 8,000 / 800), labelled on the button. It is not the million-row run. The card shows the measured rate after it finishes. On a development machine that same Hobby size finished in 37ms (catcher accepted 200 of 200; segment query p95 was 0.07ms). The 8,000 / 800 cap finished in 76ms. A full campaign run in the test suite took about 7 seconds. Vercel gives the function 1 CPU and 300 seconds, so both fit. Expect the live site to be slower than that machine.
- A full campaign run is one request, up to 300 seconds, then the page shows the result.
- "Covered for you" runs when you open that card or press Scan now. It does not tick in the background after you leave.
- Rate limits are per instance, in memory: 4 scale-test clicks per 10 minutes from one address, plus a general cap once the passcode is in use.

## Roll back to FlipIt

The old site is still in the folder `legacy/flipit`. It is not served.

Fastest rollback, no code:

1. Vercel → this project → **Deployments**.
2. Find the last deployment from before this merge (the old FlipIt site).
3. Open it → **Promote to Production** (or the three-dot menu → **Promote**).

`www.flipit.fyi` goes back to FlipIt. DNS does not change.

To roll back in git as well: on the pull request, click **Revert**, then merge the revert. The next production deploy is FlipIt again.

The old Render / Docker files are gone on purpose. Do not add a paid host for this demo.
