/**
 * The shape of each landmark on the 3D model, and the little line drawing used for it in
 * the map UI. The shapes follow the real buildings: Timberline's headhouse and wings,
 * Silcox's high-gabled L, Cloud Cap's low C-shaped inn, the scattered cabins of Government
 * Camp, and a summit cairn. Landmarks are enlarged on the model so they read at map scale.
 */
export type LandmarkShape = "summit" | "lodge" | "hut" | "inn" | "village";

// Stroked, 24x24: inherit `currentColor` so the active state can invert them.
export const landmarkIcons: Record<LandmarkShape, string> = {
  summit:
    '<path d="M3 20.5h18M6.5 20.5l2-5h7l2 5M9 15.5l1.4-4h3.2l1.4 4M10.4 11.5L12 8l1.6 3.5"/>',
  lodge:
    '<path d="M2 20.5h20M3.5 20.5v-8l5.5-5 5.5 5v8M14 20.5v-6l3.5-3 3.5 3v6M7 7.5V3.5h2v3M3.5 13h10M14 16h7"/>',
  hut:
    '<path d="M2.5 20.5h19M4.5 20.5v-7L9 7.5l4.5 6v7M7.5 8V4.5h1.6V7M13.5 11V6.5h1.6V10M13.5 20.5v-4.5H20v4.5"/>',
  inn:
    '<path d="M2 20.5h20M3.5 20.5v-6l3-2 3 2v6M9.5 20.5v-6l3-2 3 2v6M15.5 20.5v-6l3-2 3 2v6M5.5 12.5V8.5h1.5v3M13 12.5V8.5h1.5v3"/>',
  village:
    '<path d="M2 20.5h20M3.5 20.5v-5l3-3 3 3v5M10.5 20.5v-6l3.5-3.5 3.5 3.5v6M18.5 20.5v-4l2-2 2 2v4M6 12.5V9h1v3M14 11V7.5h1V11"/>',
};

// The key's generic "landmark" symbol: a simple roof, not a pin or a diamond.
export const landmarkKeyIcon =
  '<path d="M3 20.5h18M5 20.5v-8l7-6 7 6v8M5 12.5h14"/>';
