"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

import type { TravelItineraryItem } from "@/lib/types";

export function TravelRouteMap({
  items,
  focusedItemId,
  onSelect,
}: {
  items: TravelItineraryItem[];
  focusedItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;
    let disposed = false;

    void import("leaflet").then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      mapRef.current?.remove();

      const map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const points = items.map((item) => [item.latitude, item.longitude] as [number, number]);
      if (points.length > 1) {
        L.polyline(points, {
          color: "#3478f6",
          weight: 4,
          opacity: 0.72,
          dashArray: "8 7",
          lineCap: "round",
        }).addTo(map);
        map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
      } else {
        map.setView(points[0], 15);
      }

      items.forEach((item, index) => {
        const active = item.id === focusedItemId;
        const marker = L.marker([item.latitude, item.longitude], {
          icon: L.divIcon({
            className: "travel-route-marker-shell",
            html: `<span class="travel-route-marker${active ? " is-active" : ""}">${index + 1}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          keyboard: true,
          title: item.title,
        }).addTo(map);
        const tooltip = document.createElement("span");
        tooltip.textContent = item.title;
        marker.bindTooltip(tooltip, { direction: "top", offset: [0, -12] });
        marker.on("click", () => onSelectRef.current(item.id));
      });

      window.requestAnimationFrame(() => map.invalidateSize());
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [focusedItemId, items]);

  if (items.length === 0) {
    return <div className="grid h-56 place-items-center bg-slate-50 px-5 text-center text-xs leading-5 text-slate-400 lg:h-64">这一天还没有地点，先在日历中添加行程。</div>;
  }

  return <div ref={containerRef} className="h-56 w-full bg-slate-100 lg:h-64" aria-label="当天行程路线地图" />;
}
