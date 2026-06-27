# Cursor Credit Claim System

A tiny self-hosted tool that hands out the **152 Cursor referral links** to registered
hackathon guests, first-come-first-served, with **no double-assignment**.

A guest opens the link, enters their registered email, and the server:
1. checks the email is one of the approved guests (`data/guests.json`),
2. if they already claimed, returns their existing link,
3. otherwise assigns the next free link in `data/credits.csv`, records their email, and
4. redirects them to Cursor.

Because one machine holds `credits.csv` as the single source of truth, two people can never
get the same link. No database, no cloud — just Node.js + CSV.

## Run it (one command)

After ngrok is installed and authed (see "Tunnel" below), just run:

```bash
./claim/start.sh
```

This keeps the laptop awake, starts the claim server, and opens the tunnel on the static
domain `https://unrelated-chasing-hyphen.ngrok-free.dev`. Press **Ctrl+C** to stop everything.

To run just the server by itself (no tunnel, local testing):

```bash
node claim/server.js      # prints http://localhost:3000
```

No `npm install` needed — zero dependencies.

## Let guests reach it (tunnel)

The site (github.io) is static and can't run this server, so it just **links** to the tunnel
URL below. Guests' phones can't see `localhost`, so expose the port with a tunnel.

### Recommended: ngrok with a free **static domain** (URL never changes)

ngrok's free tier includes **one reserved static domain**, so the tunnel URL stays the same
across restarts — meaning you paste it into the site **once** and never touch it again.

1. Make a free account at https://ngrok.com and install ngrok (`brew install ngrok`).
2. Authenticate once: `ngrok config add-authtoken <your-token>` (from the ngrok dashboard).
3. In the ngrok dashboard → **Domains**, claim your free static domain
   (e.g. `cursor-claim-sudbury.ngrok-free.app`).
4. Start the tunnel bound to that domain:
   ```bash
   ngrok http --url=cursor-claim-sudbury.ngrok-free.app 3000
   ```
5. Put `https://cursor-claim-sudbury.ngrok-free.app` into the **Claim your Cursor credits**
   button in `index.html` (the `href="https://YOUR-CLAIM-URL.ngrok-free.app"` placeholder in
   the `#credits` section), then redeploy the site. Done once.

### Quick alternative (no signup, but URL changes each restart)

```bash
cloudflared tunnel --url http://localhost:3000
```
Prints a random `https://<random>.trycloudflare.com` URL. Fine for a quick test, but you'd have
to re-paste it into the site every time it restarts — use the ngrok static domain for the event.

## During the event

- Keep the laptop **awake and on** — it is the source of truth.
- Watch `data/credits.csv` fill up live (each row's second column gets the claimer's email).
- Check counts any time: open `http://localhost:3000/api/stats`
  → `{ "total": 152, "claimed": N, "remaining": 152 - N }`.
- Back up / commit `data/credits.csv` periodically so a crash loses nothing.

## Data files

- `data/credits.csv` — `url,email` header + 152 rows. Email blank = unclaimed.
- `data/guests.json` — array of 188 approved guest emails (lowercased), the eligibility list.

### Reset for a re-run

Blank out the email column in `data/credits.csv` (keep the header and URLs), then restart the server.

## How responses map to what the guest sees

| Situation | Guest sees |
|---|---|
| Registered, first claim | Success screen + auto-redirect to their Cursor link |
| Registered, claimed before | Same link returned again (idempotent) |
| Email not in guest list | "We couldn't find your email…" |
| All 152 links gone | "All Cursor credits have been claimed. Please see an organizer." |
