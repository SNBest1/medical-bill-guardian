import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings";
import { App } from "./App";
import "./styles.css";

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "medical-bill-guardian";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// Storage can be blocked (private windows); the demo still works, the identity just does not survive a reload.
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } };
const saveToken = (token: string) => { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* identity is per-session */ } };

const root = createRoot(document.getElementById("root")!);
// A failed connection would otherwise leave "Connecting…" on screen forever.
const connectionBuilder = DbConnection.builder().withUri(HOST).withDatabaseName(DB_NAME).withToken(readToken())
  .onConnect((_conn, _identity, token) => saveToken(token))
  .onConnectError((_ctx, error) => { console.error(error); root.render(<main className="loading-state">Could not reach the demo server. Refresh to try again.</main>); });

root.render(<StrictMode><SpacetimeDBProvider connectionBuilder={connectionBuilder}><App /></SpacetimeDBProvider></StrictMode>);
