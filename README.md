# Heart Breakers - faction site tooling

Code for the Heart Breakers (Torn) faction site, banner, reports and Discord posts.

- **This repo** holds only code: `generate.py`, the art, the leaders' tools (`tools/`) and the
  gatekeeper (`gate/`).
- **Settings and saved data** (`config.json`, `data/`) live in a separate **private** repo. The
  workflows check it out next to the code (`tools/store.sh`) and push changes back to it.

## How it runs

| Workflow | When | What |
|---|---|---|
| Faction banner | hourly | builds the site and the banner from the Torn API, posts the Discord hubs, uploads the site to Cloudflare |
| Crime delay check | every 15 min | Organized Crimes overview, delay pings, leader alerts |
| Chain watch | every 15 min | Ongoing Chain section; updates every 5 min while a chain runs |
| Gatekeeper secrets | by hand | sets the worker's secrets |

The site is served only by the gatekeeper, a Cloudflare Worker (`gate/worker.js`):
- The built files are uploaded together with the worker, so every request goes through it.
- Members sign in with a Torn API key. The key is checked once and never stored.
- Each visit is re-checked against the current member list.

## Secrets (Settings -> Secrets and variables -> Actions)

`TORN_API_KEY`, the `DISCORD_WEBHOOK_*` set, `MEMBER_DIR`, `LEADER_DIR`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, and `DATA_TOKEN`.

`DATA_TOKEN` is a fine-grained token with Contents read/write on the private data repo and Actions
read/write on this repo. Renew it before it expires, or every update stops.
