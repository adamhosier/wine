import { describe, expect, it } from "vitest";
import type { RuntimeData } from "../src/lib/data";
import { generateQuizQuestions } from "../src/lib/quiz";
import type { RegionTreeNode } from "../src/lib/regionTree";
import { GRAPE_CHARACTERISTIC_QUESTIONS } from "../src/data/grape-characteristics-questions";

function box(minLon: number, minLat: number, maxLon: number, maxLat: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

const treeNodes: RegionTreeNode[] = [
  {
    id: "region:AAA",
    slug: "alpha",
    parentId: null,
    depth: 0,
    kind: "region",
    regionKey: "AAA",
    subregionSlug: null,
    detailSlug: null,
    bounds: [-2, -2, 2, 2],
    fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
    fitMaxZoom: 6,
  },
  {
    id: "subregion:beta",
    slug: "beta",
    parentId: "region:AAA",
    depth: 1,
    kind: "subregion",
    regionKey: "AAA",
    subregionSlug: "beta",
    detailSlug: null,
    bounds: [-1, -1, 1, 1],
    fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
    fitMaxZoom: 8,
  },
  {
    id: "detail:gamma",
    slug: "gamma",
    parentId: "subregion:beta",
    depth: 2,
    kind: "detail",
    regionKey: "AAA",
    subregionSlug: "beta",
    detailSlug: "gamma",
    bounds: [-0.5, -0.5, 0.5, 0.5],
    fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
    fitMaxZoom: 10,
  },
];

const runtimeData: RuntimeData = {
  sourceId: "wset-level-2",
  sourceLabel: "WSET Level 2",
  regions: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { node_id: "region:AAA", iso_a3: "AAA", slug: "alpha", name: "Alpha" },
        geometry: box(-2, -2, 2, 2),
      },
    ],
  },
  hierarchyNodes: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { node_id: "subregion:beta", parent_node_id: "region:AAA", slug: "beta", name: "Beta" },
        geometry: box(-1, -1, 1, 1),
      },
      {
        type: "Feature",
        properties: {
          node_id: "detail:gamma",
          parent_node_id: "subregion:beta",
          slug: "gamma",
          name: "Gamma",
          leaf_grape_breakdown: [
            { grape: "Cabernet Sauvignon", pct: 60 },
            { grape: "Merlot", pct: 25 },
            { grape: "Cabernet Franc", pct: 15 },
          ],
        },
        geometry: box(-0.5, -0.5, 0.5, 0.5),
      },
    ],
  },
  explicitWaypoints: {
    type: "FeatureCollection",
    features: [],
  },
  treeNodes,
};

describe("quiz generator", () => {
  it("defines a large, valid bank of grape-characteristic questions", () => {
    expect(GRAPE_CHARACTERISTIC_QUESTIONS.length).toBeGreaterThanOrEqual(50);
    const ids = new Set<string>();
    let hasDirectFormat = false;
    let hasInverseFormat = false;
    for (const question of GRAPE_CHARACTERISTIC_QUESTIONS) {
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
      expect(question.options).toHaveLength(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(question.options.length);
      if (question.prompt.startsWith("Which grape shows characteristics of ")) {
        hasDirectFormat = true;
      }
      if (question.prompt.includes(" shows which of the following sets of characteristics?")) {
        hasInverseFormat = true;
      }
    }
    expect(hasDirectFormat).toBe(true);
    expect(hasInverseFormat).toBe(true);
  });

  it("creates requested number of questions with valid correct indices", () => {
    const questions = generateQuizQuestions(runtimeData, 20);
    expect(questions).toHaveLength(20);
    for (const question of questions) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(question.options.length);
    }
  });

  it("includes grape variety questions when grape data exists", () => {
    const questions = generateQuizQuestions(runtimeData, 20);
    expect(
      questions.some((question) => question.prompt.includes("most common grape variety in Gamma")),
    ).toBe(true);
  });

  it("replaces percentage grape questions with region-character questions", () => {
    const questions = generateQuizQuestions(runtimeData, 100, { allowRepeats: false, seed: 7 });
    expect(
      questions.some((question) => question.prompt === "Which of these regions is known for Cabernet Sauvignon?"),
    ).toBe(true);
    expect(questions.some((question) => question.prompt.includes("about what share is"))).toBe(false);
  });

  it("includes curated grape-characteristic questions when matching grapes are present", () => {
    const characteristicTreeNodes: RegionTreeNode[] = [
      ...treeNodes,
      {
        id: "detail:delta",
        slug: "delta",
        parentId: "subregion:beta",
        depth: 2,
        kind: "detail",
        regionKey: "AAA",
        subregionSlug: "beta",
        detailSlug: "delta",
        bounds: [-0.25, -0.25, 0.25, 0.25],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
    ];

    const characteristicData: RuntimeData = {
      ...runtimeData,
      treeNodes: characteristicTreeNodes,
      hierarchyNodes: {
        type: "FeatureCollection",
        features: [
          ...runtimeData.hierarchyNodes.features,
          {
            type: "Feature",
            properties: {
              node_id: "detail:delta",
              parent_node_id: "subregion:beta",
              slug: "delta",
              name: "Delta",
              leaf_grape_breakdown: [{ grape: "Riesling", pct: 100 }],
            },
            geometry: box(-0.25, -0.25, 0.25, 0.25),
          },
        ],
      },
    };

    const questions = generateQuizQuestions(characteristicData, 100, { allowRepeats: false, seed: 7 });
    expect(
      questions.some((question) => question.prompt === "Which grape shows characteristics of petroleum, lemon, and green apple?"),
    ).toBe(true);
    expect(
      questions.some((question) => question.prompt === "Riesling shows which of the following sets of characteristics?"),
    ).toBe(true);
  });

  it("includes map highlight region questions", () => {
    const questions = generateQuizQuestions(runtimeData, 20);
    const mapQuestion = questions.find((question) => question.kind === "map-region");
    expect(mapQuestion).toBeTruthy();
    expect(mapQuestion?.highlightNodeId).toBeTruthy();
    const depthById = new Map(runtimeData.treeNodes.map((node) => [node.id, node.depth]));
    for (const question of questions.filter((entry) => entry.kind === "map-region")) {
      const depth = question.highlightNodeId ? depthById.get(question.highlightNodeId) : undefined;
      expect(depth).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps map-region distractors context-local when same-root pool is sufficient", () => {
    const richTreeNodes: RegionTreeNode[] = [
      {
        id: "region:ITA",
        slug: "italy",
        parentId: null,
        depth: 0,
        kind: "region",
        regionKey: "ITA",
        subregionSlug: null,
        detailSlug: null,
        bounds: [8, 41, 16, 46],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 6,
      },
      {
        id: "region:FRA",
        slug: "france",
        parentId: null,
        depth: 0,
        kind: "region",
        regionKey: "FRA",
        subregionSlug: null,
        detailSlug: null,
        bounds: [-1, 43, 6, 50],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 6,
      },
      {
        id: "subregion:piemonte",
        slug: "piemonte",
        parentId: "region:ITA",
        depth: 1,
        kind: "subregion",
        regionKey: "ITA",
        subregionSlug: "piemonte",
        detailSlug: null,
        bounds: [7, 44, 9, 46],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 8,
      },
      {
        id: "subregion:bordeaux",
        slug: "bordeaux",
        parentId: "region:FRA",
        depth: 1,
        kind: "subregion",
        regionKey: "FRA",
        subregionSlug: "bordeaux",
        detailSlug: null,
        bounds: [-1, 44, 1, 46],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 8,
      },
      {
        id: "detail:barolo",
        slug: "barolo",
        parentId: "subregion:piemonte",
        depth: 2,
        kind: "detail",
        regionKey: "ITA",
        subregionSlug: "piemonte",
        detailSlug: "barolo",
        bounds: [7.9, 44.5, 8.1, 44.7],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:barbaresco",
        slug: "barbaresco",
        parentId: "subregion:piemonte",
        depth: 2,
        kind: "detail",
        regionKey: "ITA",
        subregionSlug: "piemonte",
        detailSlug: "barbaresco",
        bounds: [7.95, 44.6, 8.15, 44.8],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:gavi",
        slug: "gavi",
        parentId: "subregion:piemonte",
        depth: 2,
        kind: "detail",
        regionKey: "ITA",
        subregionSlug: "piemonte",
        detailSlug: "gavi",
        bounds: [8.8, 44.6, 9.0, 44.8],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:asti",
        slug: "asti",
        parentId: "subregion:piemonte",
        depth: 2,
        kind: "detail",
        regionKey: "ITA",
        subregionSlug: "piemonte",
        detailSlug: "asti",
        bounds: [8.0, 44.8, 8.2, 45.0],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:pauillac",
        slug: "pauillac",
        parentId: "subregion:bordeaux",
        depth: 2,
        kind: "detail",
        regionKey: "FRA",
        subregionSlug: "bordeaux",
        detailSlug: "pauillac",
        bounds: [-0.8, 45.1, -0.6, 45.3],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:margaux",
        slug: "margaux",
        parentId: "subregion:bordeaux",
        depth: 2,
        kind: "detail",
        regionKey: "FRA",
        subregionSlug: "bordeaux",
        detailSlug: "margaux",
        bounds: [-0.7, 45.0, -0.5, 45.2],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:graves",
        slug: "graves",
        parentId: "subregion:bordeaux",
        depth: 2,
        kind: "detail",
        regionKey: "FRA",
        subregionSlug: "bordeaux",
        detailSlug: "graves",
        bounds: [-0.6, 44.6, -0.4, 44.8],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
      {
        id: "detail:sauternes",
        slug: "sauternes",
        parentId: "subregion:bordeaux",
        depth: 2,
        kind: "detail",
        regionKey: "FRA",
        subregionSlug: "bordeaux",
        detailSlug: "sauternes",
        bounds: [-0.5, 44.5, -0.3, 44.7],
        fitPadding: { top: 20, right: 20, bottom: 20, left: 20 },
        fitMaxZoom: 10,
      },
    ];

    const richData: RuntimeData = {
      sourceId: "wset-level-2",
      sourceLabel: "WSET Level 2",
      regions: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { node_id: "region:ITA", iso_a3: "ITA", slug: "italy", name: "Italy" }, geometry: box(8, 41, 16, 46) },
          { type: "Feature", properties: { node_id: "region:FRA", iso_a3: "FRA", slug: "france", name: "France" }, geometry: box(-1, 43, 6, 50) },
        ],
      },
      hierarchyNodes: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { node_id: "subregion:piemonte", parent_node_id: "region:ITA", slug: "piemonte", name: "Piemonte" }, geometry: box(7, 44, 9, 46) },
          { type: "Feature", properties: { node_id: "subregion:bordeaux", parent_node_id: "region:FRA", slug: "bordeaux", name: "Bordeaux" }, geometry: box(-1, 44, 1, 46) },
          { type: "Feature", properties: { node_id: "detail:barolo", parent_node_id: "subregion:piemonte", slug: "barolo", name: "Barolo" }, geometry: box(7.9, 44.5, 8.1, 44.7) },
          { type: "Feature", properties: { node_id: "detail:barbaresco", parent_node_id: "subregion:piemonte", slug: "barbaresco", name: "Barbaresco" }, geometry: box(7.95, 44.6, 8.15, 44.8) },
          { type: "Feature", properties: { node_id: "detail:gavi", parent_node_id: "subregion:piemonte", slug: "gavi", name: "Gavi" }, geometry: box(8.8, 44.6, 9.0, 44.8) },
          { type: "Feature", properties: { node_id: "detail:asti", parent_node_id: "subregion:piemonte", slug: "asti", name: "Asti" }, geometry: box(8.0, 44.8, 8.2, 45.0) },
          { type: "Feature", properties: { node_id: "detail:pauillac", parent_node_id: "subregion:bordeaux", slug: "pauillac", name: "Pauillac" }, geometry: box(-0.8, 45.1, -0.6, 45.3) },
          { type: "Feature", properties: { node_id: "detail:margaux", parent_node_id: "subregion:bordeaux", slug: "margaux", name: "Margaux" }, geometry: box(-0.7, 45.0, -0.5, 45.2) },
          { type: "Feature", properties: { node_id: "detail:graves", parent_node_id: "subregion:bordeaux", slug: "graves", name: "Graves" }, geometry: box(-0.6, 44.6, -0.4, 44.8) },
          { type: "Feature", properties: { node_id: "detail:sauternes", parent_node_id: "subregion:bordeaux", slug: "sauternes", name: "Sauternes" }, geometry: box(-0.5, 44.5, -0.3, 44.7) },
        ],
      },
      explicitWaypoints: { type: "FeatureCollection", features: [] },
      treeNodes: richTreeNodes,
    };

    const questions = generateQuizQuestions(richData, 30);
    const italianDetails = new Set(["Barolo", "Barbaresco", "Gavi", "Asti"]);
    for (const question of questions) {
      if (question.kind !== "map-region" || !question.highlightNodeId?.startsWith("detail:")) {
        continue;
      }
      if (!["detail:barolo", "detail:barbaresco", "detail:gavi", "detail:asti"].includes(question.highlightNodeId)) {
        continue;
      }
      for (const option of question.options) {
        expect(italianDetails.has(option)).toBe(true);
      }
    }
  });
});
