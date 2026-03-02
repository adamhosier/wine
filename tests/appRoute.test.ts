import { describe, expect, it, vi } from "vitest";
import { buildAppPath, buildQuizPath, resolveAppPage, restoreGhPagesPath } from "../src/lib/appRoute";

describe("app routes", () => {
  it("builds base-aware map and quiz paths", () => {
    expect(buildAppPath("/wine/")).toBe("/wine/");
    expect(buildAppPath("/")).toBe("/");
    expect(buildQuizPath("/wine/")).toBe("/wine/quiz");
  });

  it("resolves the quiz page from a normalized pathname", () => {
    expect(resolveAppPage("/wine/quiz", "/wine/")).toBe("quiz");
    expect(resolveAppPage("/wine/quiz/", "/wine/")).toBe("quiz");
    expect(resolveAppPage("/wine/", "/wine/")).toBe("map");
  });

  it("restores gh pages fallback routes and preserves remaining query params", () => {
    const replaceState = vi.fn();

    restoreGhPagesPath(
      "/wine/",
      {
        search: "?p=%2Fquiz&source=wset-level-2",
        hash: "#round-2",
      },
      { replaceState },
    );

    expect(replaceState).toHaveBeenCalledWith(null, "", "/wine/quiz?source=wset-level-2#round-2");
  });

  it("does nothing when no gh pages fallback route is present", () => {
    const replaceState = vi.fn();

    restoreGhPagesPath(
      "/wine/",
      {
        search: "?source=wset-level-2",
        hash: "",
      },
      { replaceState },
    );

    expect(replaceState).not.toHaveBeenCalled();
  });
});
