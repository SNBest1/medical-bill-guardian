/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()], test: { exclude: ["node_modules", "spacetimedb/node_modules", "dist"] } });
