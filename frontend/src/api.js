import axios from "axios";

const configuredApiBase = (import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");

function inferApiBase() {
  if (configuredApiBase) {
    return configuredApiBase;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, port, origin } = window.location;

  if (protocol === "file:") {
    return "http://127.0.0.1:8000";
  }

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";

  if (isLocalHost && (port === "5173" || port === "4173" || port === "")) {
    return `${protocol}//${hostname}:8000`;
  }

  return origin;
}

const resolvedApiBase = inferApiBase();

export const apiClient = axios.create({
  baseURL: resolvedApiBase || undefined,
  timeout: 15000,
});

export function buildPublicApiUrl(path) {
  if (resolvedApiBase) {
    return `${resolvedApiBase}${path}`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }

  return path;
}
