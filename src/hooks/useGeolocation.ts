import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export function useGeolocation() {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!isSupported || !('permissions' in navigator)) return;
    let result: PermissionStatus;
    const onChange = () => setPermission(result.state);
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((r) => {
      result = r;
      setPermission(r.state);
      r.addEventListener('change', onChange);
    });
    return () => { result?.removeEventListener('change', onChange); };
  }, [isSupported]);

  const getLocation = useCallback(() => {
    if (!isSupported) {
      setError('Geolocation not supported');
      return;
    }
    if (permission === 'denied') {
      setError('Location permission denied. Please enable location access in your browser settings.');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setLoading(false);
      },
      (err) => {
        let msg = 'Location access failed';
        switch (err.code) {
          case 1: msg = 'Location permission denied. Please enable location access in your browser settings.'; break;
          case 2: msg = 'Location unavailable. Try again later.'; break;
          case 3: msg = 'Location request timed out.'; break;
        }
        setError(msg);
        toast.error(msg);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [isSupported, permission]);

  return { location, loading, error, permission, getLocation, isSupported };
}

// Calculate distance between two coordinates in kilometers (Haversine formula)
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}
