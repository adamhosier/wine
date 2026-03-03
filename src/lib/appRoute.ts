export type AppPage = "map" | "quiz";

const QUIZ_ROUTE = "/quiz";

function trimTrailingSlash(value: string): string {
  if (value === "/") {
    return "";
  }
  return value.replace(/\/+$/, "");
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function buildAppPath(basePath: string, routePath = "/"): string {
  const normalizedBasePath = trimTrailingSlash(basePath);
  if (routePath === "/") {
    return normalizedBasePath ? `${normalizedBasePath}/` : "/";
  }
  return `${normalizedBasePath}${trimTrailingSlash(routePath)}`;
}

export function buildQuizPath(basePath: string): string {
  return buildAppPath(basePath, QUIZ_ROUTE);
}

export function resolveAppPage(pathname: string, basePath: string): AppPage {
  const normalizedPathname = normalizePathname(pathname);
  return normalizedPathname === normalizePathname(buildQuizPath(basePath)) ? "quiz" : "map";
}
