import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { SpeedCamera } from '../types';

interface MapDisplayProps {
  latitude: number | null;
  longitude: number | null;
  speedCameras: SpeedCamera[];
  triggeredCameras: Set<string>;
}

const MapDisplay: React.FC<MapDisplayProps> = ({ latitude, longitude, speedCameras, triggeredCameras }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
    }).setView([latitude || 0, longitude || 0], latitude ? 16 : 2);

    // Use CartoDB Dark Matter tiles for a sleek dark mode look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(map);

    // Add attribution discretely
    L.control.attribution({ position: 'bottomright' }).addTo(map);

    // Initialize marker cluster group
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
      maxClusterRadius: 40 // Adjust for density
    });
    
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    mapInstanceRef.current = map;

    return () => {
        map.remove();
        mapInstanceRef.current = null;
        userMarkerRef.current = null;
        clusterGroupRef.current = null;
    }
  }, []);

  // Helper: Haversine Distance
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  // Update User Location
  useEffect(() => {
    if (!mapInstanceRef.current || latitude === null || longitude === null) return;
    
    const latLng: L.LatLngExpression = [latitude, longitude];
    
    if (!userMarkerRef.current) {
        userMarkerRef.current = L.circleMarker(latLng, {
           radius: 8,
           fillColor: "#3b82f6", // Blue-500
           color: "#fff",
           weight: 2,
           opacity: 1,
           fillOpacity: 0.8
        }).addTo(mapInstanceRef.current);
    } else {
        userMarkerRef.current.setLatLng(latLng);
    }
    
    // Pan to new location
    mapInstanceRef.current.panTo(latLng);
  }, [latitude, longitude]);

  // Update Speed Cameras
  useEffect(() => {
    if (!mapInstanceRef.current || !clusterGroupRef.current) return;

    clusterGroupRef.current.clearLayers();

    const markers: L.Layer[] = [];

    speedCameras.forEach(cam => {
      const isTriggered = triggeredCameras.has(cam.id);
      const marker = L.circleMarker([cam.latitude, cam.longitude], {
        radius: isTriggered ? 12 : 8,
        fillColor: isTriggered ? "#ef4444" : "#f97316", // Red if triggered, else Orange
        color: "#fff",
        weight: isTriggered ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.9,
        className: `cursor-pointer ${isTriggered ? 'camera-pulse' : ''}`
      });

      const dateStr = new Date(cam.timestamp).toLocaleDateString();
      const timeStr = new Date(cam.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let distanceText = "Distance unknown";
      if (latitude !== null && longitude !== null) {
        const dist = getDistance(latitude, longitude, cam.latitude, cam.longitude);
        if (dist > 1000) {
          distanceText = `${(dist / 1000).toFixed(2)} km away`;
        } else {
          distanceText = `${Math.round(dist)} m away`;
        }
      }

      // Styled popup content for Dark Mode
      const popupContent = `
        <div style="padding: 16px; min-width: 200px; font-family: 'Inter', sans-serif; background: #09090b;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                 <div style="padding: 6px; background: ${isTriggered ? 'rgba(239, 68, 68, 0.1)' : 'rgba(249, 115, 22, 0.1)'}; border-radius: 8px; border: 1px solid ${isTriggered ? 'rgba(239, 68, 68, 0.2)' : 'rgba(249, 115, 22, 0.2)'};">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isTriggered ? '#ef4444' : '#f97316'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                 </div>
                 <span style="font-weight: 900; color: ${isTriggered ? '#ef4444' : '#f97316'}; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;">${isTriggered ? 'Alert Active' : 'Speed Camera'}</span>
            </div>
            
            <div style="margin-bottom: 12px;">
               <div style="font-size: 10px; color: #52525b; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 4px; text-transform: uppercase;">Distance</div>
               <div style="font-size: 16px; font-weight: 800; color: #fff; font-family: 'JetBrains Mono', monospace;">${distanceText}</div>
            </div>

            ${cam.speedLimit ? `
            <div style="margin-bottom: 12px;">
               <div style="font-size: 10px; color: #52525b; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 4px; text-transform: uppercase;">Speed Limit</div>
               <div style="display: flex; align-items: center; gap: 8px;">
                 <div style="width: 32px; height: 32px; border: 3px solid #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #fff; background: #000; font-family: 'Orbitron', sans-serif;">
                   ${cam.speedLimit}
                 </div>
                 <span style="font-size: 12px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">km/h</span>
               </div>
            </div>
            ` : ''}

            <div style="margin-bottom: 8px;">
               <div style="font-size: 10px; color: #52525b; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 4px; text-transform: uppercase;">Telemetry</div>
               <div style="font-size: 13px; font-weight: 600; color: #e4e4e7;">${dateStr}</div>
               <div style="font-size: 12px; color: #71717a; font-family: 'JetBrains Mono', monospace;">${timeStr}</div>
            </div>

            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #3f3f46; letter-spacing: -0.02em;">
                    ${cam.latitude.toFixed(6)}, ${cam.longitude.toFixed(6)}
                </div>
                <button 
                  onclick="window.editCamera('${cam.id}')"
                  style="background: #3b82f6; color: #fff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 10px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;"
                >
                  Edit
                </button>
            </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: true,
        autoPan: true
      });

      markers.push(marker);
    });

    clusterGroupRef.current.addLayers(markers);

  }, [speedCameras, triggeredCameras, latitude, longitude]);

  if (latitude === null || longitude === null) {
      return (
          <div className="h-64 w-full bg-zinc-900/50 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-500">
              <span className="animate-pulse flex items-center space-x-2">
                 <span>Waiting for GPS Signal...</span>
              </span>
          </div>
      );
  }

  return <div ref={mapContainerRef} className="h-64 w-full rounded-lg border border-zinc-800 overflow-hidden relative z-0 shadow-inner" />;
};

export default MapDisplay;