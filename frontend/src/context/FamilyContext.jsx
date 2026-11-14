import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from './AuthContext';
import nativeLocationService from '../services/nativeLocationService';

const FamilyContext = createContext(null);

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}

export function FamilyProvider({ children }) {
  const { user, token, refreshUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [familyDetails, setFamilyDetails] = useState(null);
  const [pendingConsentFamily, setPendingConsentFamily] = useState(null); // When switching families, prompts for re-affirmation
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [activeSOSEvents, setActiveSOSEvents] = useState(new Set());
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Multi-Family Architecture State
  const [myFamilies, setMyFamilies] = useState([]);
  const [loadingMyFamilies, setLoadingMyFamilies] = useState(false);

  // Multi-Group Architecture State (V3)
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(() => {
    const saved = localStorage.getItem('ft_active_group_id');
    return saved ? Number(saved) : null;
  });
  const [isAllGroupsView, setIsAllGroupsView] = useState(false);
  const [allGroupsData, setAllGroupsData] = useState({ members: [], groups: [] });

  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0] || null;

  // Location tracking state and consent
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(() => {
    return localStorage.getItem('ft_tracking_enabled') === 'true';
  });
  const [trackingMode, setTrackingModeState] = useState(() => {
    return localStorage.getItem('ft_tracking_mode') || 'balanced'; // 'battery_saver' (10m) | 'balanced' (5m) | 'high_accuracy' (1m)
  });
  const [trackingStatus, setTrackingStatus] = useState('idle'); // 'idle' | 'tracking' | 'denied' | 'error'
  const [lastLocationUpdateTime, setLastLocationUpdateTime] = useState(null);
  const [activeJourneys, setActiveJourneys] = useState([]);

  const setTrackingMode = (mode) => {
    setTrackingModeState(mode);
    localStorage.setItem('ft_tracking_mode', mode);
  };

  const locationWatchRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const lastLocationRef = useRef(null);

  // Toast notification management
  const addToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Multi-Group Architecture API Methods (V3)
  const fetchGroups = useCallback(async () => {
    try {
      const data = await api.get('/groups');
      const list = data.groups || [];
      setGroups(list);
      if (list.length > 0) {
        setActiveGroupId(prev => {
          if (prev && list.some(g => g.id === prev)) return prev;
          const fallback = list[0].id;
          localStorage.setItem('ft_active_group_id', fallback);
          return fallback;
        });
      }
      return list;
    } catch (err) {
      console.error('Failed to fetch groups:', err);
      return [];
    }
  }, []);

  const fetchGroupMembers = useCallback(async (groupId) => {
    if (!groupId) return [];
    try {
      const data = await api.get(`/groups/${groupId}/members`);
      setMembers(data.members || []);
      return data.members || [];
    } catch (err) {
      console.error('Failed to fetch group members:', err);
      return [];
    }
  }, []);

  const fetchGroupGeofences = useCallback(async (groupId) => {
    if (!groupId) return [];
    try {
      const data = await api.get(`/groups/${groupId}/geofences`);
      setGeofences(data.geofences || []);
      return data.geofences || [];
    } catch (err) {
      console.error('Failed to fetch group geofences:', err);
      return [];
    }
  }, []);

  const fetchAllGroupsMap = useCallback(async () => {
    try {
      const data = await api.get('/groups/all-map');
      setAllGroupsData(data || { members: [], groups: [] });
      return data;
    } catch (err) {
      console.error('Failed to fetch all groups map:', err);
      return { members: [], groups: [] };
    }
  }, []);

  const switchActiveGroup = async (targetId) => {
    if (targetId === 'all') {
      setIsAllGroupsView(true);
      await fetchAllGroupsMap();
      return;
    }
    const numId = Number(targetId);
    setIsAllGroupsView(false);
    setActiveGroupId(numId);
    localStorage.setItem('ft_active_group_id', numId);
    await Promise.all([
      fetchGroupMembers(numId),
      fetchGroupGeofences(numId),
      fetchActiveSOS()
    ]);
  };

  const createGroup = async (groupData) => {
    const data = await api.post('/groups/create', groupData);
    await fetchGroups();
    if (data.group) {
      await switchActiveGroup(data.group.id);
    }
    addToast('success', 'Group Created!', `"${groupData.name}" has been created.`);
    return data;
  };

  const joinGroup = async (inviteCode, sharingOptions = {}) => {
    const data = await api.post('/groups/join', { inviteCode, ...sharingOptions });
    await fetchGroups();
    if (data.group) {
      await switchActiveGroup(data.group.id);
    }
    addToast('success', 'Joined Group!', `You are now a member of "${data.group?.name}".`);
    return data;
  };

  const validateGroupInvite = async (inviteCode) => {
    return await api.post('/groups/validate-invite', { inviteCode });
  };

  const updateGroupLocationSharing = async (groupId, settings) => {
    const data = await api.put(`/groups/${groupId}/location-settings`, settings);
    await fetchGroups();
    addToast('info', 'Sharing Updated', data.message || 'Preferences saved.');
    return data;
  };

  const leaveGroup = async (groupId, transferOwnerTo = null) => {
    const data = await api.post(`/groups/${groupId}/leave`, { transferOwnerTo });
    const remaining = await fetchGroups();
    if (remaining.length > 0) {
      await switchActiveGroup(remaining[0].id);
    } else {
      setActiveGroupId(null);
      setMembers([]);
    }
    addToast('info', 'Left Group', 'You have left the group.');
    return data;
  };

  const deleteGroup = async (groupId) => {
    const data = await api.delete(`/groups/${groupId}`);
    const remaining = await fetchGroups();
    if (remaining.length > 0) {
      await switchActiveGroup(remaining[0].id);
    } else {
      setActiveGroupId(null);
      setMembers([]);
    }
    addToast('info', 'Group Deleted', 'The group has been deleted.');
    return data;
  };

  const updateMemberRole = async (groupId, userId, role) => {
    const data = await api.put(`/groups/${groupId}/members/${userId}/role`, { role });
    await fetchGroupMembers(groupId);
    addToast('success', 'Role Updated', data.message);
    return data;
  };

  const removeMember = async (groupId, userId) => {
    const data = await api.delete(`/groups/${groupId}/members/${userId}`);
    await fetchGroupMembers(groupId);
    addToast('info', 'Member Removed', 'Member was removed from group.');
    return data;
  };

  const transferGroupOwner = async (groupId, newOwnerId) => {
    const data = await api.post(`/groups/${groupId}/transfer-owner`, { newOwnerId });
    await fetchGroups();
    await fetchGroupMembers(groupId);
    addToast('success', 'Ownership Transferred', data.message);
    return data;
  };

  const fetchGroupHistory = async (groupId, memberId, hours = 24) => {
    const data = await api.get(`/groups/${groupId}/history/${memberId}?hours=${hours}`);
    return data.history || [];
  };

  // Fetch family members
  const fetchMembers = useCallback(async () => {
    try {
      const data = await api.get('/family/members');
      setMembers(data.members || data || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  }, []);

  // Fetch safety alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.get('/alerts?limit=50&offset=0');
      setAlerts(data.alerts || data || []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }, []);

  // Fetch safe zones / geofences
  const fetchGeofences = useCallback(async () => {
    try {
      const data = await api.get('/geofence/list');
      setGeofences(data.geofences || data || []);
    } catch (err) {
      console.error('Failed to fetch geofences:', err);
    }
  }, []);

  // Fetch active SOS events
  const fetchActiveSOS = useCallback(async () => {
    try {
      const data = await api.get('/sos/active');
      const activeList = data.activeSOSEvents || data.sosEvents || [];
      const idSet = new Set(activeList.map(e => e.userId || e.user_id));
      setActiveSOSEvents(idSet);
    } catch (err) {
      console.error('Failed to fetch active SOS:', err);
    }
  }, []);

  // Fetch active journeys in family
  const fetchActiveJourneys = useCallback(async () => {
    try {
      const data = await api.get('/journey/active');
      setActiveJourneys(data.journeys || []);
    } catch (err) {
      console.error('Failed to fetch active journeys:', err);
    }
  }, []);

  // Start tracked journey
  const startJourney = async (journeyData) => {
    const data = await api.post('/journey/start', journeyData);
    if (data.journey) {
      setActiveJourneys(prev => [data.journey, ...prev]);
    }
    addToast('info', 'Journey Started', `On the way to ${journeyData.destinationName}`);
    return data;
  };

  // Safe arrival confirmation
  const confirmArrival = async (journeyId) => {
    const data = await api.post('/journey/arrival', { journeyId });
    setActiveJourneys(prev => prev.filter(j => j.id !== (journeyId || j.id)));
    addToast('success', 'Safe Arrival!', 'Your family has been notified of your safe arrival.');
    return data;
  };

  // Emergency check-in ("Please check on me")
  const sendCheckIn = async (message = 'Please check on me') => {
    const data = await api.post('/journey/checkin', { message });
    addToast('warning', 'Check-In Sent', 'Check-in request sent to your family circle.');
    return data;
  };

  // Cancel journey
  const cancelJourney = async () => {
    await api.post('/journey/cancel');
    setActiveJourneys(prev => prev.filter(j => j.user_id !== user?.id));
    addToast('info', 'Journey Cancelled', 'Journey cancelled.');
  };

  // Create family
  const createFamily = async (name) => {
    const data = await api.post('/family/create', { name });
    return data;
  };

  // Join family
  const joinFamily = async (inviteCode) => {
    const data = await api.post('/family/join', { inviteCode });
    return data;
  };

  // Get invite code
  const getInviteCode = async () => {
    const data = await api.get('/family/invite-code');
    return data.invite_code || data.inviteCode;
  };

  // Fetch complete current family details (owner, role, invite code)
  const fetchFamilyDetails = useCallback(async () => {
    try {
      const data = await api.get('/family/details');
      setFamilyDetails(data);
      return data;
    } catch (err) {
      console.warn('Failed to fetch family details:', err);
      return null;
    }
  }, []);

  // Validate an invite code preview before switching
  const validateInviteCode = async (inviteCode) => {
    return await api.post('/family/validate-code', { inviteCode });
  };

  // Atomic Family Switch with Location Consent Pause
  const switchFamily = async (inviteCode, transferOwnerTo = null) => {
    // Phase 7: Automatically pause location sharing during audience change
    setIsTrackingEnabled(false);
    localStorage.setItem('ft_tracking_enabled', 'false');
    await nativeLocationService.stopTracking().catch(() => {});

    const data = await api.post('/family/switch', { inviteCode, transferOwnerTo });

    // Clear old family state caches immediately
    setMembers([]);
    setAlerts([]);
    setGeofences([]);
    setActiveSOSEvents(new Set());
    setActiveJourneys([]);

    // Refresh user state
    await refreshUser();

    // Load new family resources
    await Promise.all([
      fetchMembers(),
      fetchAlerts(),
      fetchGeofences(),
      fetchActiveSOS(),
      fetchActiveJourneys(),
      fetchFamilyDetails()
    ]);

    // Set pending consent prompt for the new family circle
    setPendingConsentFamily(data.family);

    addToast('success', 'Switched Family Circle', `You have securely joined "${data.family.name}"`);
    return data;
  };

  // Leave Family with owner succession
  const leaveFamily = async (transferOwnerTo = null) => {
    setIsTrackingEnabled(false);
    localStorage.setItem('ft_tracking_enabled', 'false');
    await nativeLocationService.stopTracking().catch(() => {});

    const data = await api.post('/family/leave', { transferOwnerTo });

    // Clear all family data
    setMembers([]);
    setAlerts([]);
    setGeofences([]);
    setActiveSOSEvents(new Set());
    setActiveJourneys([]);
    setFamilyDetails(null);

    await refreshUser();
    addToast('info', 'Left Family', 'You have left the family circle.');
    return data;
  };

  // Transfer Ownership explicitly
  const transferOwnership = async (newOwnerId) => {
    const data = await api.post('/family/transfer-owner', { newOwnerId });
    await fetchFamilyDetails();
    addToast('success', 'Ownership Transferred', data.message);
    return data;
  };

  // Delete family entirely (owner only)
  const deleteFamily = async () => {
    setIsTrackingEnabled(false);
    localStorage.setItem('ft_tracking_enabled', 'false');
    await nativeLocationService.stopTracking().catch(() => {});

    const data = await api.delete('/family/delete');
    setMembers([]);
    setAlerts([]);
    setGeofences([]);
    setActiveSOSEvents(new Set());
    setActiveJourneys([]);
    setFamilyDetails(null);

    await refreshUser();
    addToast('info', 'Family Deleted', 'The family circle was deleted.');
    return data;
  };

  // Multi-Family Operations
  const fetchMyFamilies = useCallback(async () => {
    setLoadingMyFamilies(true);
    try {
      const data = await api.get('/family/my-families');
      const list = data.families || [];
      setMyFamilies(list);
      return list;
    } catch (err) {
      console.warn('Failed to fetch my families:', err);
      return [];
    } finally {
      setLoadingMyFamilies(false);
    }
  }, []);

  const createAnotherFamily = async ({ name, groupType, description }) => {
    const data = await api.post('/family/create', { name, groupType, description });
    await refreshUser();
    await fetchMyFamilies();
    await fetchGroups();
    await Promise.all([
      fetchMembers(),
      fetchAlerts(),
      fetchGeofences(),
      fetchActiveSOS(),
      fetchActiveJourneys(),
      fetchFamilyDetails()
    ]);
    addToast('success', 'Family Created!', `"${name}" has been created.`);
    return data;
  };

  const joinAnotherFamily = async (inviteCode) => {
    const data = await api.post('/family/join', { inviteCode });
    await refreshUser();
    await fetchMyFamilies();
    await fetchGroups();
    await Promise.all([
      fetchMembers(),
      fetchAlerts(),
      fetchGeofences(),
      fetchActiveSOS(),
      fetchActiveJourneys(),
      fetchFamilyDetails()
    ]);
    addToast('success', 'Joined Circle!', `You are now a member of "${data.family?.name || 'new circle'}".`);
    return data;
  };

  const selectActiveFamily = async (familyId) => {
    const data = await api.post(`/family/select/${familyId}`);
    setMembers([]);
    setAlerts([]);
    setGeofences([]);
    setActiveSOSEvents(new Set());
    setActiveJourneys([]);

    await refreshUser();
    await fetchMyFamilies();
    await Promise.all([
      fetchMembers(),
      fetchAlerts(),
      fetchGeofences(),
      fetchActiveSOS(),
      fetchActiveJourneys(),
      fetchFamilyDetails()
    ]);
    addToast('info', 'Active Circle Changed', `Switched view to "${data.family?.name || 'Circle'}".`);
    return data;
  };

  const leaveFamilyCircle = async (familyId, transferOwnerTo = null) => {
    const data = await api.post(`/family/leave/${familyId}`, { transferOwnerTo });
    await refreshUser();
    const remaining = await fetchMyFamilies();
    await fetchGroups();
    if (remaining.length > 0) {
      await Promise.all([
        fetchMembers(),
        fetchAlerts(),
        fetchGeofences(),
        fetchActiveSOS(),
        fetchActiveJourneys(),
        fetchFamilyDetails()
      ]);
    } else {
      setMembers([]);
      setAlerts([]);
      setGeofences([]);
      setActiveSOSEvents(new Set());
      setActiveJourneys([]);
      setFamilyDetails(null);
    }
    addToast('info', 'Left Family', 'You have left the circle.');
    return data;
  };

  // Create geofence
  const createGeofence = async (geofence) => {
    const data = await api.post('/geofence/create', geofence);
    await fetchGeofences();
    addToast('success', 'Safe Zone Created', `"${geofence.name}" has been added`);
    return data;
  };

  // Delete geofence
  const deleteGeofence = async (id) => {
    await api.delete(`/geofence/${id}`);
    setGeofences(prev => prev.filter(g => g.id !== id));
    addToast('info', 'Safe Zone Removed', 'The zone has been deleted');
  };

  // Trigger SOS emergency
  const triggerSOS = async (latitude = null, longitude = null) => {
    try {
      const data = await api.post('/sos/trigger', { latitude, longitude });
      setActiveSOSEvents(prev => new Set([...prev, user.id]));
      addToast('error', '🚨 SOS Broadcast Sent', 'Your emergency alert was sent to all family members!');
      return data;
    } catch (err) {
      addToast('error', 'SOS Failed', err.message || 'Could not send SOS broadcast');
      throw err;
    }
  };

  // Cancel SOS emergency
  const cancelSOS = async () => {
    try {
      await api.post('/sos/cancel');
      setActiveSOSEvents(prev => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
      addToast('info', 'SOS Cancelled', 'Emergency alert has been cancelled.');
    } catch (err) {
      addToast('error', 'Error', 'Failed to cancel SOS.');
    }
  };

  // Mark single alert as read
  const markAlertRead = async (alertId) => {
    try {
      await api.put(`/alerts/${alertId}/read`);
      setAlerts(prev => prev.map(a =>
        (a.id === alertId) ? { ...a, is_read: 1, isRead: true } : a
      ));
    } catch (err) {
      console.error('Mark alert read error:', err);
    }
  };

  // Mark all alerts read
  const markAllAlertsRead = async () => {
    try {
      await api.put('/alerts/read-all');
      setAlerts(prev => prev.map(a => ({ ...a, is_read: 1, isRead: true })));
      addToast('success', 'All Read', 'All alerts marked as read');
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  // Fetch location history (supports both history and locations keys)
  const fetchLocationHistory = async (userId, from, to) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', '500');
    const qs = params.toString();
    const data = await api.get(`/location/history/${userId}${qs ? '?' + qs : ''}`);
    return data.history || data.locations || [];
  };

  // Update location helper with duplicate suppression to save battery
  const sendLocationUpdate = useCallback(async (position) => {
    try {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const speed = position.coords.speed;
      const accuracy = position.coords.accuracy;

      // Check battery
      let batteryLevel = null;
      let isCharging = null;
      if (navigator.getBattery) {
        try {
          const battery = await navigator.getBattery();
          batteryLevel = Math.round(battery.level * 100);
          isCharging = battery.charging ? 1 : 0;
        } catch {}
      }

      // Duplicate check: if user moved less than 5m and speed is 0, don't spam server
      const prev = lastLocationRef.current;
      if (prev && prev.latitude === lat && prev.longitude === lon && !speed) {
        return;
      }

      const payload = {
        latitude: lat,
        longitude: lon,
        accuracy,
        speed: speed || 0,
        battery_level: batteryLevel,
        is_charging: isCharging
      };

      lastLocationRef.current = payload;
      await api.post('/location/update', payload);
      setLastLocationUpdateTime(new Date());
      setTrackingStatus('tracking');
    } catch (err) {
      console.warn('Location update error:', err.message);
    }
  }, []);

  // Location tracking management with explicit consent
  const toggleTracking = useCallback(async (enable) => {
    setIsTrackingEnabled(enable);
    localStorage.setItem('ft_tracking_enabled', enable ? 'true' : 'false');
    if (enable) {
      addToast('success', 'Location Sharing Started', 'Your family can now see your live updates.');
      setTrackingStatus('tracking');
    } else {
      addToast('info', 'Location Sharing Paused', 'Your live location is no longer being broadcast.');
      setTrackingStatus('idle');
      await nativeLocationService.stopTracking().catch(() => {});
    }
  }, [addToast]);

  // Hybrid Location Upload: transmits via both direct HTTPS API and live Socket.IO
  const uploadLocationFix = useCallback(async (payload) => {
    try {
      // 1. Direct HTTPS POST (ensures background updates arrive even if Socket.IO drops)
      await api.post('/location/update', payload);

      // 2. Broadcast via Socket.IO for instant zero-latency peer updates
      if (socket && isConnected) {
        socket.emit('update_location', payload);
      }

      setLastLocationUpdateTime(new Date());
      setTrackingStatus('tracking');
    } catch (err) {
      console.warn('[FamilyContext] Location update error:', err.message);
    }
  }, [socket, isConnected]);

  // Native & Background Geolocation lifecycle
  useEffect(() => {
    if (!user || !token || !isTrackingEnabled) {
      nativeLocationService.stopTracking().catch(() => {});
      return;
    }

    // Subscribe to native location updates
    const unsubscribe = nativeLocationService.subscribe((loc) => {
      setLastLocationUpdateTime(new Date(loc.timestamp));
      setTrackingStatus('tracking');

      // Optimistically update current user's marker locally
      setMembers(prev => prev.map(m => {
        if (m.id === user.id) {
          return {
            ...m,
            latitude: loc.latitude,
            longitude: loc.longitude,
            latest_location: {
              ...m.latest_location,
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy,
              speed: loc.speed,
              battery_level: loc.battery_level,
              is_charging: loc.is_charging,
              timestamp: loc.timestamp
            }
          };
        }
        return m;
      }));
    });

    // Start tracking in selected mode
    nativeLocationService.startTracking(trackingMode, uploadLocationFix).catch((err) => {
      console.warn('Native tracking error:', err);
      setTrackingStatus('error');
    });

    return () => {
      unsubscribe();
    };
  }, [user, token, isTrackingEnabled, trackingMode, uploadLocationFix]);

  // Socket.IO real-time connection and contract handling
  useEffect(() => {
    if (!token) return;

    let defaultSocket = window.location.origin;
    if (Capacitor.isNativePlatform() || (import.meta.env.PROD && typeof window !== 'undefined' && (window.location.hostname.includes('vercel.app') || !window.location.hostname.includes('localhost')))) {
      defaultSocket = 'https://family-tracker-fidw.onrender.com';
    }
    const rawSocket = import.meta.env.VITE_SOCKET_URL || defaultSocket;
    const socketUrl = rawSocket.replace(/\/+$/, '').replace(/\/api$/, '');
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 2000
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    // Real-time location update (handles both userId and user_id)
    s.on('location:update', (data) => {
      const senderId = data.userId || data.user_id;
      setMembers(prev => prev.map(m => {
        if (m.id === senderId) {
          return {
            ...m,
            latitude: data.latitude,
            longitude: data.longitude,
            latest_location: {
              latitude: data.latitude,
              longitude: data.longitude,
              speed: data.speed,
              accuracy: data.accuracy,
              battery_level: data.batteryLevel != null ? data.batteryLevel : data.battery_level,
              is_charging: data.isCharging != null ? data.isCharging : data.is_charging,
              timestamp: data.timestamp
            }
          };
        }
        return m;
      }));
    });

    // Emergency SOS triggered
    s.on('sos:triggered', (data) => {
      const senderId = data.userId || data.user_id;
      setActiveSOSEvents(prev => new Set([...prev, senderId]));
      addToast('error', '🚨 EMERGENCY SOS!', `${data.userName || data.user_name || 'A family member'} triggered an SOS!`);
    });

    // Emergency SOS cancelled
    s.on('sos:cancelled', (data) => {
      const senderId = data.userId || data.user_id;
      setActiveSOSEvents(prev => {
        const next = new Set(prev);
        next.delete(senderId);
        return next;
      });
      addToast('info', 'SOS Cancelled', `${data.userName || data.user_name || 'A family member'} cancelled their SOS.`);
    });

    // Member online
    s.on('member:online', (data) => {
      const onlineId = data.userId || data.user_id;
      if (onlineId) {
        setOnlineUsers(prev => new Set([...prev, onlineId]));
      }
    });

    // Member offline
    s.on('member:offline', (data) => {
      const offlineId = data.userId || data.user_id;
      if (offlineId) {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(offlineId);
          return next;
        });
      }
    });

    // Initial list of online members
    s.on('online:members', (idList) => {
      if (Array.isArray(idList)) {
        setOnlineUsers(new Set(idList));
      }
    });

    // New safety alert
    s.on('alert:new', (data) => {
      setAlerts(prev => [data, ...prev]);
      addToast('warning', data.title || 'Safety Alert', data.message || 'New alert');
    });

    // Safe zone created
    s.on('geofence:created', (data) => {
      setGeofences(prev => {
        if (prev.some(g => g.id === data.id)) return prev;
        return [data, ...prev];
      });
    });

    // Safe zone deleted
    s.on('geofence:deleted', (data) => {
      setGeofences(prev => prev.filter(g => g.id !== data.id));
    });

    // Member left
    s.on('member:left', (data) => {
      const leftId = data.userId || data.user_id;
      setMembers(prev => prev.filter(m => m.id !== leftId));
    });

    // Member joined
    s.on('member:joined', (data) => {
      fetchMembers();
      fetchFamilyDetails();
      fetchGroups();
      if (data?.groupId && data.groupId === activeGroupId) {
        fetchGroupMembers(data.groupId);
      }
    });

    // Group-specific updates
    s.on('group:updated', () => {
      fetchGroups();
    });

    s.on('member:sharing_updated', (data) => {
      if (data?.groupId && data.groupId === activeGroupId) {
        fetchGroupMembers(data.groupId);
      }
    });

    s.on('member:left', (data) => {
      fetchGroups();
      if (data?.groupId && data.groupId === activeGroupId) {
        fetchGroupMembers(data.groupId);
      }
    });

    s.on('member:removed', (data) => {
      fetchGroups();
      if (data?.groupId && data.groupId === activeGroupId) {
        fetchGroupMembers(data.groupId);
      }
    });

    s.on('group:deleted', () => {
      fetchGroups();
    });

    // Family owner changed
    s.on('family:owner_changed', (data) => {
      fetchFamilyDetails();
      addToast('info', 'Family Owner Updated', `Family ownership is now with ${data.newOwnerName || 'another member'}.`);
    });

    // Family deleted
    s.on('family:deleted', () => {
      refreshUser();
      setMembers([]);
      setAlerts([]);
      setGeofences([]);
      addToast('warning', 'Family Disbanded', 'The family circle has been removed.');
    });

    // Real-time Journey Events
    s.on('journey:started', (data) => {
      if (data.journey) {
        setActiveJourneys(prev => [data.journey, ...prev.filter(j => j.id !== data.journey.id)]);
        addToast('info', 'Journey Started', `${data.user?.name || 'A family member'} is en route to ${data.journey.destination_name}`);
      }
    });

    s.on('journey:completed', (data) => {
      if (data.journey) {
        setActiveJourneys(prev => prev.filter(j => j.id !== data.journey.id));
        addToast('success', 'Safe Arrival!', `🎉 ${data.user?.name || 'A family member'} arrived safely at ${data.journey.destination_name}!`);
      }
    });

    s.on('journey:checkin', (data) => {
      addToast('warning', '⚠️ Check-in Requested', `${data.userName}: "${data.message}"`);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [token, addToast]);

  // Initial data loading on mount or login
  useEffect(() => {
    if (user && token) {
      fetchGroups();
      fetchAlerts();
      fetchActiveSOS();
      fetchActiveJourneys();
      fetchMyFamilies();

      if (user.family_id) {
        fetchMembers();
        fetchGeofences();
        fetchFamilyDetails();
      }
    }
  }, [user, token, fetchGroups, fetchMyFamilies, fetchMembers, fetchAlerts, fetchGeofences, fetchActiveSOS, fetchActiveJourneys, fetchFamilyDetails]);

  const value = {
    // Legacy Family values
    members,
    alerts,
    geofences,
    familyDetails,
    pendingConsentFamily,
    setPendingConsentFamily,
    onlineUsers,
    activeSOSEvents,
    activeJourneys,
    socket,
    isConnected,
    toasts,
    isTrackingEnabled,
    trackingStatus,
    trackingMode,
    setTrackingMode,
    lastLocationUpdateTime,
    toggleTracking,
    addToast,
    removeToast,
    fetchMembers,
    fetchAlerts,
    fetchGeofences,
    fetchFamilyDetails,
    fetchActiveJourneys,
    createFamily,
    joinFamily,
    getInviteCode,
    validateInviteCode,
    switchFamily,
    leaveFamily,
    transferOwnership,
    deleteFamily,
    createGeofence,
    deleteGeofence,
    triggerSOS,
    cancelSOS,
    startJourney,
    confirmArrival,
    sendCheckIn,
    cancelJourney,
    markAlertRead,
    markAllAlertsRead,
    fetchLocationHistory,
    lastLocation: lastLocationRef.current,

    // Multi-Family Architecture
    myFamilies,
    loadingMyFamilies,
    fetchMyFamilies,
    createAnotherFamily,
    joinAnotherFamily,
    selectActiveFamily,
    leaveFamilyCircle,

    // Multi-Group Architecture V3
    groups,
    activeGroupId,
    activeGroup,
    isAllGroupsView,
    setIsAllGroupsView,
    allGroupsData,
    fetchGroups,
    fetchGroupMembers,
    fetchGroupGeofences,
    switchActiveGroup,
    fetchAllGroupsMap,
    createGroup,
    joinGroup,
    validateGroupInvite,
    updateGroupLocationSharing,
    leaveGroup,
    deleteGroup,
    updateMemberRole,
    removeMember,
    transferGroupOwner,
    fetchGroupHistory,
  };

  return (
    <FamilyContext.Provider value={value}>
      {children}
    </FamilyContext.Provider>
  );
}
