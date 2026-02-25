import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/debug.ts",
        "src/lib/focus.ts",
        "src/lib/focusState.ts",
        "src/lib/geo.ts",
        "src/lib/layerVisibility.ts",
        "src/lib/mapStyle.ts",
        "src/lib/maskGeometry.ts",
        "src/lib/maskSelection.ts",
        "src/lib/regionIndex.ts",
        "src/lib/waypointVisibility.ts",
        "src/lib/waypoints.ts",
      ],
    },
  },
});
