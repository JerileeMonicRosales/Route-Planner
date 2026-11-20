// api.js - the ONLY place the frontend talks to the Python backend.
let token = "";
try { token = localStorage.getItem("token") || ""; } catch {}

export const hasToken = () => !!token;
export function setToken(t) {
  token = t || "";
  try { t ? localStorage.setItem("token", t) : localStorage.removeItem("token"); } catch {}
}

async function call(path, method = "GET", body, signal) {
  const res = await fetch(path, {
    method, signal,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Directions. start / end / each stop can be text, or a place picked from autocomplete.
export const getDirections = (start, end, profile, stops = []) =>
  call("/api/directions", "POST", { start, end, profile, stops });

// Autocomplete suggestions for what the user has typed so far.
export async function getSuggestions(q, signal) {
  try {
    return (await call(`/api/suggest?q=${encodeURIComponent(q)}`, "GET", null, signal)).suggestions || [];
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return [];
  }
}

// Weather at points along the route.
export const getWeather = points => call("/api/weather", "POST", { points }).then(d => d.weather || []);

// Accounts, settings, favorites.
export const register = (email, password) => call("/api/register", "POST", { email, password });
export const login = (email, password) => call("/api/login", "POST", { email, password });
export const getMe = () => call("/api/me");
export const saveSettings = s => call("/api/settings", "PUT", s);
export const getFavorites = () => call("/api/favorites").then(d => d.favorites);
export const addFavorite = (name, data) => call("/api/favorites", "POST", { name, data });
export const deleteFavorite = id => call(`/api/favorites/${id}`, "DELETE");