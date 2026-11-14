import React, { useState, useEffect, useRef } from 'react';
import { Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, X, RotateCcw, Clock, Gauge, Battery } from 'lucide-react';
import { format } from 'date-fns';

const animatedPinIcon = L.divIcon({
  className: 'route-replay-pin',
  html: `
    <div style="
      width: 22px; height: 22px;
      border-radius: 50%;
      background: #EF4444;
      border: 3px solid white;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 6px; height: 6px; border-radius: 50%; background: white;"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function RouteReplayLayer({ historyPoints, currentIndex }) {
  if (!historyPoints || !Array.isArray(historyPoints) || historyPoints.length === 0) return null;

  // Filter out any invalid points
  const validPoints = historyPoints.filter(p => p.latitude != null && p.longitude != null && !isNaN(p.latitude) && !isNaN(p.longitude));
  if (validPoints.length === 0) return null;

  // Break points into continuous segments if time gap > 30 minutes to visualize tracking gaps
  const segments = [];
  let currentSegment = [];
  for (let i = 0; i < validPoints.length; i++) {
    const pt = validPoints[i];
    if (currentSegment.length > 0) {
      const prevPt = currentSegment[currentSegment.length - 1];
      const prevTime = new Date(prevPt.timestamp).getTime();
      const currTime = new Date(pt.timestamp).getTime();
      if (!isNaN(prevTime) && !isNaN(currTime) && currTime - prevTime > 30 * 60 * 1000) {
        // Gap detected (>30 mins without updates)
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
    currentSegment.push(pt);
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const currentPoint = validPoints[Math.min(currentIndex || 0, validPoints.length - 1)];

  return (
    <>
      {segments.map((seg, idx) => (
        <Polyline
          key={`replay-segment-${idx}`}
          positions={seg.map(p => [Number(p.latitude), Number(p.longitude)])}
          pathOptions={{
            color: '#6366F1',
            weight: 5,
            opacity: 0.9,
          }}
        />
      ))}

      {/* Render dotted bridge across gaps */}
      {segments.length > 1 && segments.map((seg, idx) => {
        if (idx === segments.length - 1) return null;
        const lastPt = seg[seg.length - 1];
        const nextPt = segments[idx + 1][0];
        return (
          <Polyline
            key={`replay-gap-${idx}`}
            positions={[
              [Number(lastPt.latitude), Number(lastPt.longitude)],
              [Number(nextPt.latitude), Number(nextPt.longitude)]
            ]}
            pathOptions={{
              color: '#94A3B8',
              weight: 2,
              dashArray: '4, 8',
              opacity: 0.6
            }}
          />
        );
      })}

      {currentPoint && (
        <Marker
          position={[Number(currentPoint.latitude), Number(currentPoint.longitude)]}
          icon={animatedPinIcon}
        >
          <Popup>
            <div style={{ color: '#0F172A', fontSize: '12px' }}>
              <div><strong>Time:</strong> {currentPoint.timestamp ? format(new Date(currentPoint.timestamp), 'PPpp') : 'Recorded point'}</div>
              {currentPoint.speed != null && <div><strong>Speed:</strong> {Math.round(currentPoint.speed)} km/h</div>}
              {currentPoint.battery_level != null && (
                <div><strong>Battery:</strong> {currentPoint.battery_level}%</div>
              )}
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}

export default function RouteReplayControls({
  historyPoints,
  currentIndex,
  onIndexChange,
  onClose,
  memberName,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const timerRef = useRef(null);

  const totalPoints = Array.isArray(historyPoints) ? historyPoints.length : 0;
  const currentPoint = historyPoints?.[currentIndex];

  useEffect(() => {
    if (isPlaying && totalPoints > 1) {
      const intervalMs = Math.max(150, Math.floor(1000 / speedMultiplier));
      timerRef.current = setInterval(() => {
        onIndexChange((prev) => {
          if (prev >= totalPoints - 1) {
            setIsPlaying(false);
            return totalPoints - 1;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speedMultiplier, totalPoints, onIndexChange]);

  const togglePlay = () => {
    if (currentIndex >= totalPoints - 1) {
      onIndexChange(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    onIndexChange(0);
  };

  const cycleSpeed = () => {
    const speeds = [1, 2, 5];
    const nextIdx = (speeds.indexOf(speedMultiplier) + 1) % speeds.length;
    setSpeedMultiplier(speeds[nextIdx]);
  };

  if (!historyPoints || historyPoints.length === 0) return null;

  return (
    <div className="route-replay-controls">
      <button
        className="replay-btn"
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play Replay'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
      </button>

      <button
        className="replay-speed"
        onClick={handleRestart}
        title="Restart from beginning"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}
      >
        <RotateCcw size={14} />
      </button>

      <input
        type="range"
        className="replay-scrubber"
        min={0}
        max={Math.max(totalPoints - 1, 0)}
        value={currentIndex}
        onChange={(e) => {
          setIsPlaying(false);
          onIndexChange(Number(e.target.value));
        }}
      />

      <button className="replay-speed" onClick={cycleSpeed} title="Playback speed">
        {speedMultiplier}x
      </button>

      <div className="replay-timestamp">
        {currentPoint ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} />
            {currentPoint.timestamp ? format(new Date(currentPoint.timestamp), 'HH:mm:ss') : '00:00'}
            {currentPoint.speed > 0 && (
              <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <Gauge size={12} /> {Math.round(currentPoint.speed)} km/h
              </span>
            )}
          </span>
        ) : (
          '00:00'
        )}
      </div>

      <button className="replay-close-btn" onClick={onClose} title="Close Route Replay">
        <X size={18} />
      </button>
    </div>
  );
}
