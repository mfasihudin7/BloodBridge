"use client";

import React, { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  blood_group: string;
  units: number;
  units_filled: number;
  hospital: string;
  urgency: "critical" | "urgent" | "planned";
  status: string;
  lat: number;
  lng: number;
  created_at: string;
  distance_m: number;
}

interface LeafletMapViewProps {
  pins: MapPin[];
  center: [number, number];
  zoom: number;
  onBoundsChange: (bounds: { min_lat: number; min_lng: number; max_lat: number; max_lng: number }) => void;
  onSelectPin: (pin: MapPin) => void;
  selectedPinId?: string | null;
}

// Leaflet type declarations for browser-loaded CDN Leaflet
declare global {
  interface Window {
    L: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export default function LeafletMapView({
  pins,
  center,
  zoom,
  onBoundsChange,
  onSelectPin,
  selectedPinId,
}: LeafletMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const markersLayerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [leafletLoaded, setLeafletLoaded] = React.useState(() => {
    return typeof window !== "undefined" && Boolean(window.L);
  });

  // Dynamically inject Leaflet stylesheet and script if not already on page
  useEffect(() => {
    if (typeof window === "undefined" || window.L) return;

    const cssId = "leaflet-cdn-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const scriptId = "leaflet-cdn-js";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.crossOrigin = "";
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      const existing = document.getElementById(scriptId) as HTMLScriptElement;
      existing.addEventListener("load", () => setLeafletLoaded(true));
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapInstanceRef.current) return;

    const L = window.L;
    if (!L) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    const emitBounds = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        min_lat: bounds.getSouth(),
        min_lng: bounds.getWest(),
        max_lat: bounds.getNorth(),
        max_lng: bounds.getEast(),
      });
    };

    map.on("moveend", emitBounds);
    emitBounds();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Center update when props change
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, zoom, { animate: true });
    }
  }, [center, zoom]);

  // Update Markers
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current || !markersLayerRef.current) return;
    const L = window.L;
    if (!L) return;

    const group = markersLayerRef.current;
    group.clearLayers();

    pins.forEach((pin) => {
      const isCritical = pin.urgency === "critical";
      const isUrgent = pin.urgency === "urgent";
      const bg = isCritical ? "#dc2626" : isUrgent ? "#d97706" : "#7f1d1d";
      const isSelected = selectedPinId === pin.id;

      const html = `
        <div style="
          background-color: ${bg};
          color: white;
          border-radius: 9999px;
          padding: 4px 8px;
          font-weight: 700;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          border: ${isSelected ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.8)"};
          transform: ${isSelected ? "scale(1.15)" : "scale(1.0)"};
          cursor: pointer;
          white-space: nowrap;
        ">
          <span>🩸 ${pin.blood_group}</span>
          <span style="font-size: 10px; opacity: 0.9;">(${pin.units - pin.units_filled}u)</span>
        </div>
      `;

      const icon = L.divIcon({
        className: "custom-leaflet-marker",
        html,
        iconSize: [60, 28],
        iconAnchor: [30, 14],
      });

      const marker = L.marker([pin.lat, pin.lng], { icon });
      marker.on("click", () => {
        onSelectPin(pin);
      });

      group.addLayer(marker);
    });
  }, [leafletLoaded, pins, selectedPinId, onSelectPin]);

  return (
    <div className="relative w-full h-full min-h-[480px] bg-neutral-100 rounded-2xl overflow-hidden shadow-inner border border-neutral-200">
      {!leafletLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-50/80 z-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-crimson-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-neutral-600">Loading OpenStreetMap Engine...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full min-h-[480px]" />
    </div>
  );
}
