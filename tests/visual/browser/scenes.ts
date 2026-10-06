/**
 * Scene manifest: every browser review scene, the element that holds one
 * theme × locale panel, and the scales captured. Panel identity is read from
 * the panel's own data-theme/lang (or data-locale) so names stay stable.
 */
export type SceneDefinition = {
  /** Also captured at device pixel ratio 2. */
  dpr2: boolean;
  id: "primitives" | "controls" | "catalog" | "loading";
  panel: string;
  query: string;
  scales: readonly number[];
  /** Themes applied to the document when panels do not carry their own. */
  documentThemes?: readonly ("light" | "dark")[];
};

export const scenes: readonly SceneDefinition[] = [
  {
    dpr2: true,
    id: "primitives",
    panel: ".primitive-state-scene",
    query: "?scene=primitives",
    scales: [1, 2],
  },
  {
    dpr2: true,
    id: "controls",
    panel: ".control-state-scene",
    query: "?scene=controls",
    scales: [1, 2],
  },
  {
    dpr2: false,
    id: "catalog",
    panel: ".catalog-state-scene",
    query: "?scene=catalog",
    scales: [1, 2],
  },
  {
    documentThemes: ["light", "dark"],
    dpr2: true,
    id: "loading",
    panel: ".loading-gallery__scene",
    query: "",
    scales: [1, 2],
  },
];
