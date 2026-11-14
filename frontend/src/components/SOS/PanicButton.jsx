import React, { useState, useRef, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { AlertOctagon, X, Check } from 'lucide-react';

export default function PanicButton() {
  const { user } = useAuth();
  const { triggerSOS, cancelSOS, activeSOSEvents } = useFamily();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const holdTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const isSOSActive = activeSOSEvents.has(user?.id);

  const startHold = (e) => {
    // Only handle primary touch/click
    if (e.button && e.button !== 0) return;
    if (isSOSActive || submitting) return;

    setHolding(true);
    setProgress(0);

    const startTime = Date.now();
    const duration = 1000; // 1s hold

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
    }, 40);

    holdTimerRef.current = setTimeout(async () => {
      clearInterval(progressIntervalRef.current);
      setHolding(false);
      setProgress(0);
      setSubmitting(true);

      // Attempt to acquire fresh coordinates, but NEVER fail if unavailable
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await triggerSOS(pos.coords.latitude, pos.coords.longitude);
            } finally {
              setSubmitting(false);
            }
          },
          async () => {
            // Geolocation denied or timed out — send SOS without fake 0,0
            try {
              await triggerSOS(null, null);
            } finally {
              setSubmitting(false);
            }
          },
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 10000 }
        );
      } else {
        try {
          await triggerSOS(null, null);
        } finally {
          setSubmitting(false);
        }
      }
    }, duration);
  };

  const endHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  };

  const handleCancelSOS = async () => {
    try {
      setSubmitting(true);
      await cancelSOS();
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      endHold();
    };
  }, []);

  return (
    <div className="sos-button">
      {isSOSActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div className="sos-active-badge">
            <span className="pulse-dot" />
            🚨 SOS BROADCASTING
          </div>
          <button
            className="sos-cancel-btn"
            onClick={handleCancelSOS}
            disabled={submitting}
            title="Cancel Emergency Broadcast"
          >
            <X size={16} />
            <span>{submitting ? 'Cancelling...' : 'Cancel SOS'}</span>
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            className={`sos-trigger ${holding ? 'holding' : ''}`}
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            disabled={submitting}
            title="Press and hold 1 second for emergency SOS"
            aria-label="Emergency Panic Button"
          >
            <AlertOctagon size={28} />
            <span>{submitting ? 'SENDING...' : holding ? 'HOLD...' : 'SOS'}</span>
          </button>

          {holding && (
            <div className="sos-hold-progress">
              <svg viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  style={{
                    strokeDasharray: 226,
                    strokeDashoffset: 226 - (226 * progress) / 100,
                  }}
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
