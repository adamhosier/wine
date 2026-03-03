import { describe, expect, it } from "vitest";
import { buildAppPath, buildQuizPath, resolveAppPage } from "../src/lib/appRoute";

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
});
