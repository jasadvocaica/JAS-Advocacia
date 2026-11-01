import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // vitest.setup-env roda PRIMEIRO: define as variáveis VITE_SUPABASE_* antes
    // de qualquer módulo importar o client (que lança no import se faltarem).
    setupFiles: ["./vitest.setup-env.ts", "./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
