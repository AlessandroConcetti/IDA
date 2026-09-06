import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    // Les scénarios PGlite démarrent parfois plusieurs bases WASM et scrypt.
    // Borner la concurrence évite de saturer le PC ; 5 s était insuffisant
    // pour les tests de migration/redémarrage, sans échec d’assertion.
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
