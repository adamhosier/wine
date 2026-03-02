export type AppPage = "map" | "quiz";

const GH_PAGES_ROUTE_PARAM = "p";
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

export function restoreGhPagesPath(
  basePath: string,
  locationLike: Pick<Location, "search" | "hash">,
  historyLike: Pick<History, "replaceState">,
): void {
  const params = new URLSearchParams(locationLike.search);
  const routePath = params.get(GH_PAGES_ROUTE_PARAM);
  if (!routePath) {
    return;
  }
  params.delete(GH_PAGES_ROUTE_PARAM);
  const nextSearch = params.toString();
  const normalizedRoutePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
  const nextPath = buildAppPath(basePath, normalizedRoutePath);
  const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ""}${locationLike.hash}`;
  historyLike.replaceState(null, "", nextUrl);
}
