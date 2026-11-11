"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { MapPin } from "@/components/map/LeafletMapView";

// Dynamically import Leaflet with SSR false to prevent window is undefined errors
const LeafletMapView = dynamic(() => import("@/components/map/LeafletMapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[520px] bg-neutral-100 rounded-2xl flex items-center justify-center border border-neutral-200">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-crimson-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium text-neutral-600">Initializing Map View...</span>
      </div>
    </div>
  ),
});

export default function CommunityMapPage() {
  const { t, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const { user } = useAuth();
  const [, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [bloodGroupFilter, setBloodGroupFilter] = useState<string>("all");

  // Default to Islamabad / Rawalpindi coordinates if user coordinates not detected
  const [mapCenter, setMapCenter] = useState<[number, number]>([33.6844, 73.0479]);
  const [mapZoom, setMapZoom] = useState<number>(12);

  const [pins, setPins] = useState<MapPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Fetch pins when bounding box changes
  const handleBoundsChange = useCallback(
    async (bounds: { min_lat: number; min_lng: number; max_lat: number; max_lng: number }) => {
      // Ensure area does not exceed backend limit of 1.0 deg²
      const latSpan = Math.abs(bounds.max_lat - bounds.min_lat);
      const lngSpan = Math.abs(bounds.max_lng - bounds.min_lng);
      if (latSpan * lngSpan > 0.95) {
        // Narrow bounding box around center if zoomed too far out
        const centerLat = (bounds.min_lat + bounds.max_lat) / 2;
        const centerLng = (bounds.min_lng + bounds.max_lng) / 2;
        bounds = {
          min_lat: centerLat - 0.45,
          max_lat: centerLat + 0.45,
          min_lng: centerLng - 0.45,
          max_lng: centerLng + 0.45,
        };
      }

      setLoading(true);
      try {
        const res = await api.getMapPins(bounds, "open");
        if (res.ok && res.data) {
          setPins(res.data);
        }
      } catch {
        // Silently swallow network drop during rapid pans
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-detect user geolocation on initial mount
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter([pos.coords.latitude, pos.coords.longitude]);
          setMapZoom(13);
        },
        () => {
          // Fallback to default center if permission declined
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Filter pins based on user selections
  const filteredPins = pins.filter((p) => {
    if (urgencyFilter !== "all" && p.urgency !== urgencyFilter) return false;
    if (bloodGroupFilter !== "all" && p.blood_group !== bloodGroupFilter) return false;
    return true;
  });

  // Handle Respond from Map Pin
  const handleRespond = async (pinId: string) => {
    if (!user) {
      setActionMsg({
        type: "error",
        text: "Please sign in to volunteer and respond to this request.",
      });
      return;
    }

    setRespondingId(pinId);
    setActionMsg(null);

    const res = await api.respondToMapPin(pinId);
    setRespondingId(null);

    if (res.ok) {
      setActionMsg({
        type: "success",
        text: t.map.respond_success,
      });
      // Remove responded pin from open pins
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      if (selectedPin?.id === pinId) {
        setSelectedPin(null);
      }
    } else {
      setActionMsg({
        type: "error",
        text: res.message || "Failed to respond. You may have an active commitment or be outside matching range.",
      });
    }
  };

  const centerOnMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          startTransition(() => {
            setMapCenter([pos.coords.latitude, pos.coords.longitude]);
            setMapZoom(14);
          });
        },
        () => {
          alert("Could not access location. Please check browser permissions.");
        }
      );
    }
  };

  return (
    <div className={`min-h-screen bg-neutral-50 pb-20 ${isRTL ? "rtl" : "ltr"}`}>
      {/* Top Header */}
      <section className="bg-white border-b border-neutral-200 pt-8 pb-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-crimson-600 animate-ping" />
                <span className="text-xs font-semibold tracking-wider uppercase text-crimson-700">
                  Live Emergency Grid
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
                {t.map.title}
              </h1>
              <p className="mt-1 text-sm text-neutral-600 max-w-2xl">
                {t.map.subtitle}
              </p>
            </div>

            {/* View Mode & Location Buttons */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              <button
                type="button"
                onClick={centerOnMyLocation}
                className="btn btn-secondary text-xs sm:text-sm py-2 px-3 flex items-center gap-1.5"
                title={t.map.my_location}
              >
                <span>📍</span>
                <span>{t.map.my_location}</span>
              </button>

              <div className="inline-flex rounded-xl bg-neutral-100 p-1 border border-neutral-200">
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewMode === "map"
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  🗺️ {t.map.view_map}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewMode === "list"
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  📋 {t.map.view_list} ({filteredPins.length})
                </button>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              <span>Filter:</span>
            </div>

            {/* Blood Group Filter */}
            <select
              value={bloodGroupFilter}
              onChange={(e) => setBloodGroupFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-neutral-300 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-crimson-500"
            >
              <option value="all">{t.map.filter_blood_group}: ALL</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                <option key={bg} value={bg}>
                  Blood Group {bg}
                </option>
              ))}
            </select>

            {/* Urgency Filter */}
            <div className="flex items-center gap-1.5">
              {[
                { key: "all", label: t.map.filter_all },
                { key: "critical", label: t.map.filter_critical },
                { key: "urgent", label: t.map.filter_urgent },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setUrgencyFilter(item.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    urgencyFilter === item.key
                      ? "bg-crimson-600 text-white shadow-xs"
                      : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {loading && (
              <span className="text-xs text-neutral-400 flex items-center gap-1 ml-auto">
                <span className="w-2 h-2 rounded-full bg-crimson-500 animate-pulse" />
                Scanning region...
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Banner Alert for Feedback */}
        {actionMsg && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm font-medium ${
              actionMsg.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-crimson-50 text-crimson-900 border-crimson-200"
            }`}
          >
            {actionMsg.text}
          </div>
        )}

        {viewMode === "map" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map Area */}
            <div className="lg:col-span-2 h-[550px] relative">
              <LeafletMapView
                pins={filteredPins}
                center={mapCenter}
                zoom={mapZoom}
                onBoundsChange={handleBoundsChange}
                onSelectPin={(pin) => setSelectedPin(pin)}
                selectedPinId={selectedPin?.id}
              />
            </div>

            {/* Selected Pin Details Side Panel */}
            <div className="lg:col-span-1">
              {selectedPin ? (
                <div className="card p-6 border-crimson-200 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`badge text-xs uppercase tracking-wider ${
                        selectedPin.urgency === "critical"
                          ? "badge-critical"
                          : selectedPin.urgency === "urgent"
                          ? "badge-urgent"
                          : "badge-planned"
                      }`}
                    >
                      {selectedPin.urgency}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedPin(null)}
                      className="text-neutral-400 hover:text-neutral-600 text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-black text-crimson-700">
                      {selectedPin.blood_group}
                    </span>
                    <span className="text-sm font-bold text-neutral-600">
                      {selectedPin.units - selectedPin.units_filled} / {selectedPin.units}{" "}
                      {t.map.units_needed}
                    </span>
                  </div>

                  <div className="space-y-3 mb-6 text-sm text-neutral-700">
                    <div>
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                        {t.map.hospital}
                      </span>
                      <span className="font-semibold text-neutral-900">
                        {selectedPin.hospital}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                        Broadcast Time
                      </span>
                      <span>
                        {new Date(selectedPin.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={respondingId === selectedPin.id}
                      onClick={() => handleRespond(selectedPin.id)}
                      className="btn btn-primary w-full py-3 text-sm font-bold shadow-md"
                    >
                      {respondingId === selectedPin.id
                        ? t.map.responding
                        : t.map.respond_btn}
                    </button>
                    <Link
                      href={`/requests/${selectedPin.id}`}
                      className="btn btn-secondary w-full py-2.5 text-xs font-semibold text-center block"
                    >
                      View Live Tracker
                    </Link>
                  </div>

                  <p className="mt-4 text-[11px] text-neutral-400 text-center leading-relaxed">
                    {t.map.disclaimer}
                  </p>
                </div>
              ) : (
                <div className="card p-8 text-center text-neutral-500 border-dashed border-2 flex flex-col items-center justify-center h-full min-h-[300px]">
                  <span className="text-3xl mb-2">📍</span>
                  <p className="font-semibold text-neutral-800 mb-1">
                    Select a Pin on the Map
                  </p>
                  <p className="text-xs text-neutral-500 max-w-xs">
                    Click any colored pin marker to inspect hospital details, units needed, and volunteer directly.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {filteredPins.length === 0 ? (
              <div className="card p-12 text-center text-neutral-500">
                <span className="text-4xl block mb-2">🔍</span>
                <p className="font-bold text-neutral-800 text-lg mb-1">
                  {t.map.no_pins}
                </p>
                <p className="text-sm text-neutral-500">
                  Try switching back to the map view to pan towards major medical centers.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPins.map((pin) => (
                  <div key={pin.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`badge text-xs uppercase tracking-wider ${
                          pin.urgency === "critical"
                            ? "badge-critical"
                            : pin.urgency === "urgent"
                            ? "badge-urgent"
                            : "badge-planned"
                        }`}
                      >
                        {pin.urgency}
                      </span>
                      <span className="text-2xl font-black text-crimson-700">
                        {pin.blood_group}
                      </span>
                    </div>

                    <div className="mb-4">
                      <h3 className="font-bold text-neutral-900 text-base">
                        {pin.hospital}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {pin.units - pin.units_filled} / {pin.units} {t.map.units_needed}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-neutral-100">
                      <button
                        type="button"
                        disabled={respondingId === pin.id}
                        onClick={() => handleRespond(pin.id)}
                        className="btn btn-primary flex-1 py-2 text-xs font-bold"
                      >
                        {respondingId === pin.id ? "..." : t.map.respond_btn}
                      </button>
                      <Link
                        href={`/requests/${pin.id}`}
                        className="btn btn-secondary py-2 px-3 text-xs font-semibold"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
