import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useFamily } from '../../context/FamilyContext';
import { RouteReplayLayer } from './RouteReplay';
import { formatDistanceToNow } from 'date-fns';
import {
  Battery, Gauge, MapPin, Radio, Layers, NavigationOff,
  Navigation, Eye, Maximize, Compass, ExternalLink, X, Flag
} from 'lucide-react';

// Fix Leaflet marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Production-ready tile providers (Google Maps, Esri, Humanitarian OSM)
// Zero API keys required - 100% reliable enterprise CDNs that do NOT block with 403
const MAP_LAYERS = {
  google_roadmap: {
    name: 'Google Maps (Default)',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    attribution: '&copy; Google Maps',
    maxZoom: 20,
  },
  google_satellite: {
    name: 'Google Maps (Satellite)',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    attribution: '&copy; Google Maps',
    maxZoom: 20,
  },
  esri_streets: {
    name: 'Esri Street Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ',
    maxZoom: 19,
  },
  esri_satellite: {
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  osm_hot: {
    name: 'Humanitarian OSM',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, HOT',
    maxZoom: 19,
  },
  opentopo: {
    name: 'Terrain (Topo)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM',
    maxZoom: 17,
  }
};

// Smooth camera movement controller
function MapFlyController({ targetCoord }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoord && targetCoord[0] != null && targetCoord[1] != null) {
      map.flyTo(targetCoord, 16, { animate: true, duration: 1.2 });
    }
  }, [targetCoord, map]);
  return null;
}

// Follow member controller: smoothly locks camera onto followed member
function FollowMemberController({ followMemberId, members }) {
  const map = useMap();
  useEffect(() => {
    if (!followMemberId) return;
    const target = members.find(m => m.id === followMemberId);
    if (!target) return;
    const lat = target.latitude != null ? target.latitude : target.latest_location?.latitude;
    const lng = target.longitude != null ? target.longitude : target.latest_location?.longitude;
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      map.panTo([lat, lng], { animate: true, duration: 1.0 });
    }
  }, [followMemberId, members, map]);
  return null;
}

// Keep map size synchronized when container resizes
function MapResizeObserver() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container || !window.ResizeObserver) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Auto fit bounds to encompass all family members
function AutoFitBounds({ members, triggerFit }) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    const validPositions = members
      .map(m => {
        const lat = m.latitude != null ? m.latitude : m.latest_location?.latitude;
        const lng = m.longitude != null ? m.longitude : m.latest_location?.longitude;
        return (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
      })
      .filter(Boolean);

    if (validPositions.length > 0 && (!initialFitDone.current || triggerFit)) {
      if (validPositions.length === 1) {
        map.setView(validPositions[0], 15);
      } else {
        const bounds = L.latLngBounds(validPositions);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
      initialFitDone.current = true;
    }
  }, [members, map, triggerFit]);

  return null;
}

// Map click listener for geofence or destination picking
function MapClickHandler({ onMapClick }) {
  const map = useMap();
  useEffect(() => {
    if (!onMapClick) return;
    const handleClick = (e) => {
      onMapClick(e.latlng);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onMapClick]);
  return null;
}

export default function LiveMap({
  selectedMemberId,
  onSelectMember,
  focusedCoord,
  onMapClick,
  isPickingLocation,
  replayHistory,
  replayIndex,
  activeJourneys = []
}) {
  const { members, geofences, onlineUsers, activeSOSEvents } = useFamily();
  const [activeLayerKey, setActiveLayerKey] = useState(() => {
    const saved = localStorage.getItem('ft_map_layer');
    if (saved && MAP_LAYERS[saved] && saved !== 'osm') return saved;
    return 'google_roadmap';
  });
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [followMemberId, setFollowMemberId] = useState(null);
  const [triggerFitCount, setTriggerFitCount] = useState(0);
  const [navRoute, setNavRoute] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const containerRef = useRef(null);

  // Clear legacy blocked OSM or Carto keys from storage
  useEffect(() => {
    const saved = localStorage.getItem('ft_map_layer');
    if (!saved || saved === 'osm' || saved === 'carto' || saved === 'carto_voyager' || saved === 'carto_dark') {
      localStorage.setItem('ft_map_layer', 'google_roadmap');
      setActiveLayerKey('google_roadmap');
    }
  }, []);

  const handleSelectLayer = (key) => {
    setActiveLayerKey(key);
    localStorage.setItem('ft_map_layer', key);
    setShowLayerMenu(false);
  };

  const activeLayer = MAP_LAYERS[activeLayerKey] || MAP_LAYERS.osm;

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Find current user's coordinate
  const userMember = members.find(m => m.is_current_user || m.isMe);
  const userLat = userMember?.latitude ?? userMember?.latest_location?.latitude;
  const userLng = userMember?.longitude ?? userMember?.latest_location?.longitude;

  // Calculate live navigation route using OSRM with external deep links
  const handleStartNavigation = async (targetMember) => {
    const tLat = targetMember.latitude ?? targetMember.latest_location?.latitude;
    const tLng = targetMember.longitude ?? targetMember.latest_location?.longitude;
    if (tLat == null || tLng == null) return;

    if (userLat == null || userLng == null) {
      // Fallback: direct destination card with external Google Maps link
      setNavRoute({
        targetName: targetMember.name,
        targetLat: tLat,
        targetLng: tLng,
        coords: [],
        distanceKm: null,
        durationMin: null,
      });
      return;
    }

    setNavLoading(true);
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${tLng},${tLat}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        setNavRoute({
          targetName: targetMember.name,
          targetLat: tLat,
          targetLng: tLng,
          coords,
          distanceKm: (route.distance / 1000).toFixed(1),
          durationMin: Math.round(route.duration / 60)
        });
      } else {
        // Fallback straight line
        setNavRoute({
          targetName: targetMember.name,
          targetLat: tLat,
          targetLng: tLng,
          coords: [[userLat, userLng], [tLat, tLng]],
          distanceKm: null,
          durationMin: null
        });
      }
    } catch {
      // Direct line fallback
      setNavRoute({
        targetName: targetMember.name,
        targetLat: tLat,
        targetLng: tLng,
        coords: [[userLat, userLng], [tLat, tLng]],
        distanceKm: null,
        durationMin: null
      });
    } finally {
      setNavLoading(false);
    }
  };

  // First valid coordinate for centering
  const firstMemberWithLoc = members.find(m => {
    const lat = m.latitude != null ? m.latitude : m.latest_location?.latitude;
    const lng = m.longitude != null ? m.longitude : m.latest_location?.longitude;
    return lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
  });

  const defaultCenter = firstMemberWithLoc
    ? [
        firstMemberWithLoc.latitude != null ? firstMemberWithLoc.latitude : firstMemberWithLoc.latest_location.latitude,
        firstMemberWithLoc.longitude != null ? firstMemberWithLoc.longitude : firstMemberWithLoc.latest_location.longitude,
      ]
    : [20.5937, 78.9629]; // Geographic default

  // Create member pin with initial and live status
  const createMemberIcon = (member, isOnline, isSOS, isFollowed) => {
    const initial = (member.name || 'U').charAt(0).toUpperCase();
    const bgColor = isSOS ? '#DC2626' : (member.avatar_color || '#4F46E5');
    const pulseClass = isSOS ? 'custom-marker sos-pulse' : (isOnline ? 'custom-marker online' : 'custom-marker');
    const ringStyle = isFollowed ? 'border: 3px solid #10B981; box-shadow: 0 0 14px rgba(16, 185, 129, 0.8);' : '';

    return L.divIcon({
      className: 'leaflet-custom-div-icon',
      html: `
        <div class="${pulseClass}" style="background-color: ${bgColor}; ${ringStyle}">
          ${initial}
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -38],
    });
  };

  const hasAnyLocations = members.some(m => {
    const lat = m.latitude != null ? m.latitude : m.latest_location?.latitude;
    const lng = m.longitude != null ? m.longitude : m.latest_location?.longitude;
    return lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
  });

  return (
    <div ref={containerRef} className="map-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Informative empty state overlay when no location recorded yet */}
      {!hasAnyLocations && !replayHistory && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 850,
            background: 'var(--glass)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: 'var(--text-200)',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none'
          }}
        >
          <NavigationOff size={16} className="text-warning" />
          <span>No live locations shared yet. Click <strong>"Sharing Live"</strong> above to broadcast.</span>
        </div>
      )}

      {/* Floating Navigation Card */}
      {navRoute && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 890,
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '16px',
            padding: '14px 20px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: '#fff',
            minWidth: '320px',
            maxWidth: '92%'
          }}
        >
          <div style={{ background: '#3B82F6', borderRadius: '12px', padding: '10px' }}>
            <Navigation size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>
              Routing to {navRoute.targetName}
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
              {navRoute.distanceKm ? `${navRoute.distanceKm} km (~${navRoute.durationMin} mins driving)` : 'Direct trajectory'}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${navRoute.targetLat},${navRoute.targetLng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#60A5FA',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Google Maps</span>
                <ExternalLink size={12} />
              </a>
              <a
                href={`https://maps.apple.com/?daddr=${navRoute.targetLat},${navRoute.targetLng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#A78BFA',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Apple Maps</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <button
            onClick={() => setNavRoute(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px'
            }}
            title="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Follow Member Active Banner */}
      {followMemberId && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 880,
            background: 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '24px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
          }}
        >
          <Compass size={16} />
          <span>Following {members.find(m => m.id === followMemberId)?.name || 'Member'} live</span>
          <button
            onClick={() => setFollowMemberId(null)}
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: '4px'
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Map Control Toolbar (Top-Right) */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 850, display: 'flex', gap: '8px' }}>
        {/* Layer Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            className={`map-control-btn ${showLayerMenu ? 'active' : ''}`}
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            title="Switch Map Tiles (Google Maps, OpenStreetMap, Satellite, Topo)"
            style={{ width: 'auto', padding: '0 12px', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            <Layers size={16} />
            <span>{activeLayer.name}</span>
          </button>

          {showLayerMenu && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: '0',
                background: 'var(--bg-800)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                padding: '6px',
                minWidth: '190px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 900,
              }}
            >
              {Object.entries(MAP_LAYERS).map(([key, layer]) => (
                <button
                  key={key}
                  onClick={() => handleSelectLayer(key)}
                  style={{
                    background: activeLayerKey === key ? 'var(--primary-600)' : 'transparent',
                    color: activeLayerKey === key ? '#ffffff' : 'var(--text-200)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '13px',
                    fontWeight: activeLayerKey === key ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.2s',
                  }}
                >
                  <span>{layer.name}</span>
                  {activeLayerKey === key && <span style={{ fontSize: '10px' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fit Bounds Button */}
        <button
          className="map-control-btn"
          onClick={() => setTriggerFitCount(prev => prev + 1)}
          title="Fit All Members in View"
          style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Compass size={18} />
        </button>

        {/* Legend Toggle */}
        <button
          className={`map-control-btn ${showLegend ? 'active' : ''}`}
          onClick={() => setShowLegend(!showLegend)}
          title="Toggle Map Legend"
          style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Eye size={18} />
        </button>

        {/* Fullscreen Toggle */}
        <button
          className="map-control-btn"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Maximize size={18} />
        </button>
      </div>

      {/* Map Legend Overlay */}
      {showLegend && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '12px',
            zIndex: 850,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#F8FAFC',
            fontSize: '12px',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
            Map Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }}></span>
            <span>Online Member</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#64748B' }}></span>
            <span>Offline Member</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#DC2626', boxShadow: '0 0 6px #DC2626' }}></span>
            <span>🚨 Active SOS Emergency</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px dashed #4F46E5' }}></span>
            <span>Safe Zone / Geofence</span>
          </div>
        </div>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={activeLayerKey}
          attribution={activeLayer.attribution}
          url={activeLayer.url}
          maxZoom={activeLayer.maxZoom}
          subdomains={activeLayer.subdomains || 'abc'}
        />

        <MapResizeObserver />
        <AutoFitBounds members={members} triggerFit={triggerFitCount} />
        <FollowMemberController followMemberId={followMemberId} members={members} />
        {focusedCoord && <MapFlyController targetCoord={focusedCoord} />}
        {isPickingLocation && <MapClickHandler onMapClick={onMapClick} />}

        {/* Route Replay Polyline and Animated Marker Layer */}
        {replayHistory && replayHistory.length > 0 && (
          <RouteReplayLayer historyPoints={replayHistory} currentIndex={replayIndex || 0} />
        )}

        {/* Navigation Polyline Layer */}
        {navRoute && navRoute.coords && navRoute.coords.length > 0 && (
          <Polyline
            positions={navRoute.coords}
            pathOptions={{
              color: '#3B82F6',
              weight: 6,
              opacity: 0.85,
              dashArray: '8, 8'
            }}
          />
        )}

        {/* Active Journeys Destination Markers */}
        {activeJourneys.map((j) => (
          <Marker
            key={`journey-dest-${j.id}`}
            position={[j.destination_lat, j.destination_lng]}
            icon={L.divIcon({
              className: 'leaflet-custom-div-icon',
              html: `<div style="background:#10B981; color:#fff; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(16,185,129,0.7); font-size:16px;">🏁</div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
          >
            <Popup>
              <div style={{ color: '#0F172A', fontWeight: 600 }}>
                <div style={{ fontSize: '13px' }}>🏁 Destination: {j.destination_name}</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  {j.user_name} is en route (ETA ~{j.estimated_duration_min}m)
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Safe Zones / Geofences */}
        {geofences.map((fence) => {
          if (fence.latitude == null || fence.longitude == null) return null;
          return (
            <Circle
              key={`geofence-${fence.id}`}
              center={[fence.latitude, fence.longitude]}
              radius={fence.radius || 200}
              pathOptions={{
                color: fence.color || '#4F46E5',
                fillColor: fence.color || '#4F46E5',
                fillOpacity: 0.18,
                weight: 2,
                dashArray: '4, 6',
              }}
            >
              <Popup>
                <div style={{ color: '#0F172A', fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} color={fence.color || '#4F46E5'} />
                    <span>{fence.name}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    Radius: {fence.radius} meters
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* Family Member Markers */}
        {members.map((member) => {
          const lat = member.latitude != null ? member.latitude : member.latest_location?.latitude;
          const lng = member.longitude != null ? member.longitude : member.latest_location?.longitude;
          if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

          const isOnline = onlineUsers.has(member.id);
          const isSOS = activeSOSEvents.has(member.id);
          const isFollowed = followMemberId === member.id;
          const loc = member.latest_location || {};
          const updatedAt = loc.timestamp || member.updated_at || member.created_at;

          return (
            <Marker
              key={`member-${member.id}`}
              position={[lat, lng]}
              icon={createMemberIcon(member, isOnline, isSOS, isFollowed)}
              eventHandlers={{
                click: () => onSelectMember && onSelectMember(member),
              }}
            >
              <Popup>
                <div className="marker-popup" style={{ color: '#0F172A', minWidth: '180px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#0F172A' }}>
                    {member.name}
                    {isSOS && <span style={{ color: '#DC2626', marginLeft: '6px', fontSize: '12px' }}>🚨 SOS ACTIVE</span>}
                  </h4>

                  <div className="marker-popup-detail" style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                    <Radio size={14} />
                    <span>{isOnline ? 'Online now' : 'Offline'}</span>
                  </div>

                  {loc.speed != null && loc.speed > 0 && (
                    <div className="marker-popup-detail" style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                      <Gauge size={14} />
                      <span>{Math.round(loc.speed)} km/h</span>
                    </div>
                  )}

                  {loc.battery_level != null && (
                    <div className="marker-popup-detail" style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                      <Battery size={14} />
                      <span>
                        {loc.battery_level}% {loc.is_charging ? '(Charging)' : ''}
                      </span>
                    </div>
                  )}

                  {updatedAt && (
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                      Updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
                    </div>
                  )}

                  {/* Actions inside Popup: Follow & Navigate */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                    <button
                      onClick={() => setFollowMemberId(isFollowed ? null : member.id)}
                      style={{
                        flex: 1,
                        background: isFollowed ? '#10B981' : '#F1F5F9',
                        color: isFollowed ? '#fff' : '#0F172A',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <Compass size={12} />
                      <span>{isFollowed ? 'Following' : 'Follow'}</span>
                    </button>

                    <button
                      onClick={() => handleStartNavigation(member)}
                      disabled={navLoading}
                      style={{
                        flex: 1,
                        background: '#3B82F6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <Navigation size={12} />
                      <span>Directions</span>
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
