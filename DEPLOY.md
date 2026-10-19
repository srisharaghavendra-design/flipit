# Put the Northwind demo on www.flipit.fyi

This is the click-by-click path. You do not need to write code. Budget about an hour, mostly waiting. Do it the day before the demo so the address has time to update.

The app is one website. It includes the main screen and the Engine room at `/engine`. Email in the demo is caught inside the server. It is never sent to a real inbox.

## Which host, and why

Use **Render** (https://render.com).

The demo is a normal Node program that stays running, writes databases to disk, and receives its own email. Vercel, which hosts the current FlipIt site, runs short functions and does not keep that kind of program alive. Render does.

Use a normal (Hobby) Render account. That account fee is $0. The service itself needs the **1 CPU / 2 GB** plan (Render's id for it is `1c-2g`; older screens still call it Standard). It is about **$25 per month**, plus about **$0.25** for the 1 GB disk. Render bills by the second, so if you suspend the service after the meeting the charge stops. The free plan and the $7 / 512 MB plan are too small: the demo runs five programs plus a database, and they will crash. Render will ask for a card. A $1 check is refunded.

A 1 GB disk is included in the setup file so the demo data survives a restart. Each boot also loads the fictional Northwind Networks data again, so a fresh start is always the same demo.

## What you will click yourself

1. Create a Render account and connect GitHub.
2. Create the service from this repo (steps below).
3. Type a passcode when Render asks for `DEMO_PASSCODE`.
4. Open the `onrender.com` link and try the demo.
5. Add `www.flipit.fyi` and `flipit.fyi` in Render.
6. Change two DNS records at the place you bought the domain (Namecheap). Leave email records alone.
7. Wait until https://www.flipit.fyi/ opens the demo, then send your boss that address and the passcode.

You do not need to change nameservers. You do not need to delete the old Vercel project. Until step 6, the current FlipIt site stays up.

## 1. Create the service

1. Go to https://dashboard.render.com and sign up. Use "Sign in with GitHub" if you can.
2. If GitHub asks permission, allow Render to see the `flipit` repository.
3. Click **New** → **Blueprint**.
4. Choose the `flipit` repo and the branch that contains this file (`render.yaml`).
5. Render reads `render.yaml` and shows one web service named `flipit-mops`. It should say Docker, region Singapore, plan **1 CPU / 2 GB**, and a 1 GB disk. Leave those as they are.
6. It will ask you to fill in **DEMO_PASSCODE**. Type a passcode you can say out loud in the meeting (letters and numbers, at least 8 characters). This is not a password for your accounts. Anyone with the link and this passcode can use the demo. Write it down.
7. Click **Apply** / **Deploy**. The first build takes several minutes. Wait until the status is **Live**.

If the blueprint button is missing: **New → Web Service**, connect the repo, set the language to **Docker**, the instance to **1 CPU / 2 GB**, health check path to `/health`, add a disk mounted at `/var/data` of 1 GB, then add the environment variables from the next section by hand and deploy.

## 2. Environment variables

Set these on the service (**Environment** in the left menu). `render.yaml` already sets the ones marked "already set".

| Name | What to put | Already set? |
|---|---|---|
| `DEMO_PASSCODE` | The passcode from step 6. Required. | You type it |
| `MOPS_PUBLIC` | `https://www.flipit.fyi` | Yes |
| `MOPS_DATA_DIR` | `/var/data` | Yes |
| `MOPS_RUNS_DIR` | `/var/data/runs` | Yes |
| `MOPS_INTERNAL_SMTP` | `1` | Yes |
| `MOPS_RESEED` | `1` (loads fresh fictional data every time the service starts). Use `0` only if you want to keep clicks from the rehearsal. | Yes |
| `NODE_ENV` | `production` | Yes |
| `MOPS_API_KEY` | Optional. Leave blank for the demo. The app then uses its built-in rules, which is what the screens were designed around. If you add a key, also set `MOPS_API_BASE` (for example `https://api.openai.com/v1`) and `MOPS_MODEL`. If the key fails, the app falls back to rules. | No. Add only if you want it |
| `LOAD_DEFAULT_CONTACTS` | Optional. How many fake people the scale-test button creates. Leave blank. On a 2 GB plan the button uses 20,000, not 1,000,000. | No |
| `LOAD_DEFAULT_SENDS` | Optional. How many demo emails that button sends into the catcher. Leave blank (2,000 on a 2 GB plan). | No |
| `LOAD_MAX_CONTACTS` | Optional cap. Leave blank. Do not set this to 1000000 on this plan. | No |

Do not add an SMTP username, password, or mail host. The demo must not send real email.

After the service is Live, open the URL that ends in `.onrender.com`. You should see the passcode page. Enter the passcode. Then open `/engine` as well (add `/engine` to the end of the address). Click around. The "Run full campaign" button is the main story. The scale-test button is safe to press; it will not try to create a million records.

## 3. Point the domain at Render

Do this only after the `.onrender.com` site works.

### In Render

1. Open the service → **Settings** → **Custom Domains**.
2. Click **Add Custom Domain** and enter `www.flipit.fyi`.
3. Render will also add `flipit.fyi` and will redirect the bare name to `www`. If it does not, add `flipit.fyi` yourself.
4. Leave this page open. It shows a hostname ending in `.onrender.com`. Copy that hostname. It looks like `flipit-mops.onrender.com`.

### What the domain looks like today

The domain is managed at Namecheap (nameservers `dns1.registrar-servers.com` and `dns2.registrar-servers.com`). Today:

- `www` is a CNAME to `660f5e4b2083e49a.vercel-dns-017.com` (the current Vercel site).
- `flipit.fyi` (the bare name, shown as `@`) is an A record to `216.198.79.1` (also Vercel).
- Mail forwarding is a set of MX records pointing at `eforward1.registrar-servers.com` through `eforward5.registrar-servers.com`, plus a TXT record that starts with `v=spf1`.

### In Namecheap

1. Sign in at https://www.namecheap.com → **Domain List** → `flipit.fyi` → **Advanced DNS**.
2. Edit the **www** CNAME. Change the value from `660f5e4b2083e49a.vercel-dns-017.com` to the hostname Render gave you, such as `flipit-mops.onrender.com`. No `https://`. If Namecheap adds a trailing dot, that is fine.
3. Edit the **A record** whose host is `@`. Change `216.198.79.1` to `216.24.57.1`. That is Render's address for the bare domain. Delete any extra A records for `@` so only this one remains.
4. Do **not** change the MX records, the TXT record, or the nameservers. Those keep email forwarding working.
5. Save. If there is a TTL dropdown, choose the shortest time (5 minutes or Automatic).

The two records, written out:

| Type | Host | Value | What it does |
|---|---|---|---|
| CNAME | `www` | `flipit-mops.onrender.com` (use the exact name Render shows) | Sends www.flipit.fyi to the demo |
| A | `@` | `216.24.57.1` | Sends flipit.fyi to Render, which redirects it to www |

Back in Render, wait until both domains say **Verified** and the certificate is issued. That can take from a few minutes to an hour. Then open https://www.flipit.fyi/ in a private window, enter the passcode, and open https://www.flipit.fyi/engine.

## 4. If something is wrong

- **The old FlipIt site is still showing.** The DNS change has not finished, or the old A / CNAME record is still there. Give it 30 minutes (the old records were cached for 30 minutes) and check that only the two new records exist.
- **The passcode page never appears and the URL shows an error.** On Render, open **Logs**. The last lines should include `@mops ready`. If the log says the service ran out of memory, the plan is too small. Change the instance to 1 CPU / 2 GB and deploy again.
- **After the demo, stop the bill.** On the service page, choose **Suspend**. You can resume it later. Suspending does not delete the passcode or the domain.
- **You want the old site back.** In Namecheap, put the www CNAME back to `660f5e4b2083e49a.vercel-dns-017.com` and the `@` A record back to `216.198.79.1`. The old site is also saved in this repo under `legacy/flipit`.

## Optional: a different host

The same `Dockerfile` runs on Railway or Fly.io if you already have an account there. You still need a service with at least 2 GB of memory, a writable disk, the environment variables above, and a health check on `/health`. The DNS records would use that host's addresses instead of Render's. For Tuesday, stay with Render.
