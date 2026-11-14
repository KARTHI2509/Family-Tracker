import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

export default function useLocation() {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);
  const prevPositionRef = useRef(null);
  const prevTimeRef = useRef(null);

  const calculateSpeed = useCallback((lat1, lon1, lat2, lon2, timeDiffMs) => {
    if (timeDiffMs <= 0) return 0;
    const R = 6371e3;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance / (timeDiffMs / 1000);
  }, []);

  const sendLocation = useCallback(async (position) => {
    const { latitude, longitude, accuracy, speed } = position.coords;
    let computedSpeed = speed;

    if ((computedSpeed === null || computedSpeed === undefined) && prevPositionRef.current && prevTimeRef.current) {
      const timeDiff = Date.now() - prevTimeRef.current;
      computedSpeed = calculateSpeed(
        prevPositionRef.current.latitude, prevPositionRef.current.longitude,
        latitude, longitude, timeDiff
      );
    }

    prevPositionRef.current = { latitude, longitude };
    prevTimeRef.current = Date.now();

    const payload = {
      latitude,
      longitude,
      accuracy,
      speed: computedSpeed,
      battery_level: null,
      is_charging: null,
    };

    if (navigator.getBattery) {
      try {
        const battery = await navigator.getBattery();
        payload.battery_level = Math.round(battery.level * 100);
        payload.is_charging = battery.charging;
      } catch {}
    }

    setCurrentLocation(payload);

    try {
      await api.post('/location/update', payload);
    } catch (err) {
      console.error('Location update failed:', err);
    }
  }, [calculateSpeed]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setError(null);
    setIsTracking(true);

    watchRef.current = navigator.geolocation.watchPosition(
      sendLocation,
      (err) => {
        if (err.code === 1) setError('Location permission denied');
        else if (err.code === 2) setError('Location unavailable');
        else setError('Location request timed out');
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendLocation, () => {}, {
        enableHighAccuracy: false, maximumAge: 60000, timeout: 10000,
      });
    }, 5 * 60 * 1000);
  }, [sendLocation]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  return { currentLocation, isTracking, error, startTracking, stopTracking };
}
