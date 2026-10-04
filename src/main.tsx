import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings";
import { App } from "./App";
import "./styles.css";

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "medical-bill-guardian";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;
const DISCOVER_SANDBOX = import.meta.env.VITE_SANDBOX_DISCOVERY === "true";

// Storage can be blocked (private windows); the demo still works, the identity just does not survive a reload.
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } };
const saveToken = (token: string) => { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* identity is per-session */ } };

/** Starts an idempotent sandbox scan through the same-origin Worker after identity is established. */
async function discoverSandbox(identity: string, token: string): Promise<void> {
  try {
    const response = await fetch("/api/sandbox/discover", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ownerIdentity: identity }),
    });
    if (!response.ok) console.warn(`Sandbox discovery unavailable (${response.status}); the synthetic case remains available.`);
  } catch {
    console.warn("Sandbox discovery unavailable; the synthetic case remains available.");
  }
}

const root = createRoot(document.getElementById("root")!);
// A failed connection would otherwise leave "Connecting…" on screen forever.
const connectionBuilder = DbConnection.builder().withUri(HOST).withDatabaseName(DB_NAME).withToken(readToken())
  .onConnect((_conn, identity, token) => {
    saveToken(token);
    if (DISCOVER_SANDBOX) void discoverSandbox(identity.toHexString(), token);
  })
  .onConnectError((_ctx, error) => { console.error(error); root.render(<main className="loading-state">Could not reach the demo server. Refresh to try again.</main>); });

root.render(<StrictMode><SpacetimeDBProvider connectionBuilder={connectionBuilder}><App /></SpacetimeDBProvider></StrictMode>);
