# FlipIt (previous live site)

This folder is the site that was live at https://www.flipit.fyi/ before the Northwind @mops demo.

It is a static site plus a few serverless functions, deployed on Vercel:

- Pages: home, `/app`, `/app-v2`, `/pricing`, `/admin`, `/plan`, `/next-move`, and the `/beat-salesforce`, `/beat-hubspot`, `/beat-outreach`, `/beat-gong`, `/beat-clari` pages.
- API routes in `api/`: rescue, rescue-depth, next-move, get-plan, save-plan, warm-cache.
- `vercel.json` has the routes and a daily warm-cache cron.
- The app calls Anthropic and Supabase. Those keys were environment variables on Vercel. They are not in this folder.

Nothing here was deleted. To put this site back on the web, point a Vercel project at this folder (root directory `legacy/flipit`) and restore the same environment variables. The DNS steps in `DEPLOY.md` are what move www.flipit.fyi off Vercel.
