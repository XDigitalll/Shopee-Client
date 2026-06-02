export function getBackendUrl() {
  const backendUrl = process.env.API_BASE_URL?.trim() || process.env.BACKEND_URL?.trim();
  if (backendUrl) {
    return backendUrl.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:8080";
  }

  throw new Error("API_BASE_URL or BACKEND_URL is required in production.");
}
