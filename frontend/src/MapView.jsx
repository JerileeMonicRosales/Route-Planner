import { useEffect, useRef } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import Icon from "./icons.jsx";

// Draws the route, start/stop/end markers, and a weather overlay along the route.
export default function MapView({ route, weather = [], units }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const wx = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current).setView([20, 0], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    wx.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    if (!route) return;
    layer.current.clearLayers();
    L.polyline(route.coordinates, { color: "#fff", weight: 9, opacity: .9 }).addTo(layer.current);
    const line = L.polyline(route.coordinates, { color: "#EE5212", weight: 5 }).addTo(layer.current);
    const dot = (p, color, label) =>
      L.circleMarker(p, { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label).addTo(layer.current);
    dot([route.origin.lat, route.origin.lng], "#1D1B1A", route.origin.label);
    (route.waypoints || []).forEach((w, i) => dot([w.lat, w.lng], "#6E6560", `Stop ${i + 1}: ${w.label}`));
    dot([route.destination.lat, route.destination.lng], "#EE5212", route.destination.label);
    map.current.fitBounds(line.getBounds(), { padding: [30, 30] });
  }, [route]);

  useEffect(() => {
    wx.current.clearLayers();
    weather.forEach(w => {
      const t = w.temp_c == null ? "–"
        : units === "imperial" ? `${Math.round(w.temp_c * 9 / 5 + 32)}°F` : `${Math.round(w.temp_c)}°C`;
      const wind = units === "imperial" ? `${Math.round((w.wind_kmh || 0) / 1.609)} mph` : `${Math.round(w.wind_kmh || 0)} km/h`;
      const html = renderToStaticMarkup(<span className="wx-chip"><Icon name={w.kind} size={16} /><b>{t}</b></span>);
      L.marker([w.lat, w.lng], {
        icon: L.divIcon({ className: "wx", html, iconSize: [70, 28], iconAnchor: [35, 14] }),
        zIndexOffset: 500,
      }).bindTooltip(`${w.label}, wind ${wind}${w.rain_mm ? `, rain ${w.rain_mm} mm` : ""}`).addTo(wx.current);
    });
  }, [weather, units]);

  return <div ref={el} className="map" />;
}