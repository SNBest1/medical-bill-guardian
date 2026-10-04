# Public website connected to the local live demo

Public URL: https://medical-bill-guardian.vercel.app

This URL mirrors the same synthetic cases and integrations as localhost. It is a Vercel reverse proxy to a Cloudflare tunnel connected to a production Next.js server on port 3100. The production server uses the same ignored local `.env`, `.env.local`, and `data/guardian.sqlite` as localhost on port 3000. Fish calls, incoming patient/hospital texts, receipt checks and Nessie refunds therefore update the same cases. Visitors share the current demo patient, as they do on localhost.

Start or restore everything with `npm run demo:start`. After the first public publication, that command restores/verifies the public mirror too. Run `npm run demo:check` before presenting.

To publish the mirror initially or repair its tunnel/deployment, run `npm run demo:publish`. It builds the app into `.next-public`, starts/reuses the local production server, creates/reuses the website tunnel, and deploys only a tiny reverse-proxy configuration to the linked Vercel project. It verifies that the public case list equals the local list. It does not place calls, post credits or reset cases.

**Keep the computer awake and connected to the internet.** The app, text receiver, worker, receipt bridge, production mirror and tunnels must keep running. Vercel hosts the public URL; the live backend still runs on this computer. This is not an independent cloud backend and will go offline when the computer shuts down. A permanent deployment would require moving the database and background receiver/worker to an always-on host.

Logs: `data/demo-logs/public-server.log` and `public-tunnel.log`. The current website tunnel and Vercel URL are saved in ignored `data/public-mirror.json`. The receipt tunnel is separate and continues to use the authenticated `/bill-receipt` endpoint.

Use `npm run demo:publish` for this live mirror instead of deploying the root Next.js project directly. Credentials and case data stay on the local backend; the Vercel proxy deployment contains neither. The server remains a synthetic shared demo, not a production patient service.
