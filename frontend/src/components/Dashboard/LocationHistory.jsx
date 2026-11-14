import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { format, subHours, subDays } from 'date-fns';
import { Clock, Gauge, Battery, Play, Navigation, AlertCircle, Calendar } from 'lucide-react';

const FILTER_INTERVALS = [
  { id: '1h', label: '1h', getRange: () => ({ from: subHours(new Date(), 1).toISOString(), to: new Date().toISOString() }) },
  { id: '3h', label: '3h', getRange: () => ({ from: subHours(new Date(), 3).toISOString(), to: new Date().toISOString() }) },
  { id: '6h', label: '6h', getRange: () => ({ from: subHours(new Date(), 6).toISOString(), to: new Date().toISOString() }) },
  { id: '12h', label: '12h', getRange: () => ({ from: subHours(new Date(), 12).toISOString(), to: new Date().toISOString() }) },
  { id: '24h', label: '24h', getRange: () => ({ from: subHours(new Date(), 24).toISOString(), to: new Date().toISOString() }) },
  { id: '7d', label: '7 Days', getRange: () => ({ from: subDays(new Date(), 7).toISOString(), to: new Date().toISOString() }) },
  { id: 'custom', label: 'Custom' }
];

export default function LocationHistory({ onFocusPoint, onStartRouteReplay }) {
  const { members, fetchLocationHistory } = useFamily();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeInterval, setActiveInterval] = useState('24h');
  const [customDate, setCustomDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (members.length > 0 && !selectedUserId) {
      setSelectedUserId(String(members[0].id));
    }
  }, [members, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;

    let isMounted = true;
    const loadHistory = async () => {
      setLoading(true);
      setError('');
      try {
        let fromDate, toDate;
        if (activeInterval === 'custom') {
          fromDate = `${customDate} 00:00:00`;
          toDate = `${customDate} 23:59:59`;
        } else {
          const filter = FILTER_INTERVALS.find(f => f.id === activeInterval);
          if (filter?.getRange) {
            const range = filter.getRange();
            fromDate = range.from;
            toDate = range.to;
          }
        }

        const points = await fetchLocationHistory(selectedUserId, fromDate, toDate);
        if (isMounted) {
          setHistory(Array.isArray(points) ? points : []);
        }
      } catch (err) {
        console.error('Failed to load location history:', err);
        if (isMounted) {
          setError(err.message || 'Could not load location history.');
          setHistory([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [selectedUserId, activeInterval, customDate, fetchLocationHistory]);

  const selectedMember = members.find(m => String(m.id) === String(selectedUserId));

  return (
    <div className="location-history">
      {/* Member selector */}
      <div className="history-controls" style={{ marginBottom: '8px' }}>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          aria-label="Select family member for history"
          style={{ width: '100%' }}
        >
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Preset Interval Filters (1h, 3h, 6h, 12h, 24h, 7d, custom) */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {FILTER_INTERVALS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveInterval(item.id)}
            style={{
              flex: item.id === '7d' ? '1.2' : '1',
              minWidth: '42px',
              padding: '6px 4px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: activeInterval === item.id ? 'var(--primary-600)' : 'var(--bg-700)',
              color: activeInterval === item.id ? '#ffffff' : 'var(--text-300)',
              transition: 'all 0.15s ease'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Custom Date Input when "custom" interval is selected */}
      {activeInterval === 'custom' && (
        <div style={{ marginBottom: '10px' }}>
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            aria-label="Select custom history date"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger-400)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {history.length > 1 && (
        <button
          className="btn btn-primary w-full"
          onClick={() => onStartRouteReplay && onStartRouteReplay(history, selectedMember?.name)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', marginBottom: '12px' }}
        >
          <Play size={15} />
          <span>Replay Route ({history.length} points)</span>
        </button>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-400)', fontSize: '13px' }}>
          Loading location history...
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <h4>No History Recorded</h4>
          <p>No locations recorded for this member during the selected time period.</p>
        </div>
      ) : (
        <div className="timeline">
          {history.map((point, index) => {
            const hasCoords = point.latitude != null && point.longitude != null;
            // Check if there was a gap between this point and the previous point (>30 mins)
            let hasGapBefore = false;
            if (index > 0) {
              const prevTime = new Date(history[index - 1].timestamp).getTime();
              const currTime = new Date(point.timestamp).getTime();
              if (!isNaN(prevTime) && !isNaN(currTime) && currTime - prevTime > 30 * 60 * 1000) {
                hasGapBefore = true;
              }
            }

            return (
              <React.Fragment key={point.id || index}>
                {hasGapBefore && (
                  <div style={{
                    padding: '4px 12px',
                    margin: '6px 0',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderLeft: '2px dashed #EF4444',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#F87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>⚠️ Tracking gap (&gt;30 min inactive)</span>
                  </div>
                )}
                <div
                  className="timeline-item"
                  onClick={() => hasCoords && onFocusPoint && onFocusPoint([point.latitude, point.longitude])}
                >
                  <div className="timeline-dot" />
                  <div className="timeline-time">
                    {point.timestamp ? format(new Date(point.timestamp), 'PP p') : 'Time recorded'}
                  </div>
                  <div className="timeline-details">
                    {point.speed != null && point.speed > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Gauge size={12} /> {Math.round(point.speed)} km/h
                      </span>
                    )}
                    {point.battery_level != null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Battery size={12} /> {point.battery_level}%
                      </span>
                    )}
                    {hasCoords && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-500)', fontSize: '11px' }}>
                        <Navigation size={11} /> {Number(point.latitude).toFixed(4)}, {Number(point.longitude).toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
