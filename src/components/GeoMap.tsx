import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint { lat: number; lng: number; accuracy?: number; label?: string; highlight?: boolean; }
export interface MapCircle { lat: number; lng: number; radius: number; label?: string; }

interface Props {
  points?: MapPoint[]; circles?: MapCircle[]; path?: boolean; height?: string;
  onClick?: (lat: number, lng: number) => void; onSelect?: (index: number) => void;
}

export function GeoMap({ points = [], circles = [], path = false, height = "420px", onClick, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current).setView([20, 0], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    points.forEach((p, i) => {
      const ll: L.LatLngExpression = [p.lat, p.lng];
      bounds.push(ll);
      if (p.accuracy && p.accuracy > 0) {
        L.circle(ll, { radius: p.accuracy, color: "#1677FF", weight: 1, fillOpacity: p.highlight ? 0.18 : 0.06 }).addTo(g);
      }
      const mk = L.circleMarker(ll, { radius: p.highlight ? 9 : 6, color: "#fff", weight: 2, fillColor: p.highlight ? "#FF3547" : "#1677FF", fillOpacity: 1 }).addTo(g);
      if (p.label) mk.bindPopup(p.label);
      mk.on("click", () => onSelect?.(i));
    });
    if (path && points.length > 1) L.polyline(points.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: "#1677FF", weight: 2, opacity: 0.6 }).addTo(g);
    circles.forEach((c) => {
      const ll: L.LatLngExpression = [c.lat, c.lng];
      bounds.push(ll);
      const ci = L.circle(ll, { radius: c.radius, color: "#16C784", weight: 2, fillOpacity: 0.1 }).addTo(g);
      if (c.label) ci.bindTooltip(c.label);
    });
    if (bounds.length && !fitted.current) {
      m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 17 });
      fitted.current = true;
    }
  }, [points, circles, path, onSelect]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-xl" role="application" aria-label="Map" />;
}
