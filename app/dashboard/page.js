"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getPublicEnv } from '@/lib/publicEnv';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './incident-markers.css';
import {
  buildPopupHTML,
  getIncidentCoordinates,
  formatSensorType,
} from '@/lib/incidentMarkers';
import {
  getSuggestedTeams,
  getTeamBadgeClass,
} from '@/lib/incidentTeams';
import { getNearestStation } from '@/lib/emergencyStations';
import {
  setupIncidentLayers,
  updateIncidentsOnMap,
  bindIncidentLayerInteraction,
  bindClusterLayerInteraction,
} from '@/lib/incidentMapLayers';
import {
  getClusterMembers,
  getClusterRootId,
  isInMultiReportCluster,
} from '@/lib/incidentClusters';
import ClusterDrawer from './ClusterDrawer';
import './cluster-drawer.css';
import { 
  Activity, 
  MapPin, 
  Clock, 
  ShieldAlert, 
  Loader2, 
  Radio, 
  FileText,
  Database,
  ExternalLink,
  Map as MapIcon,
  Users,
} from 'lucide-react';

const FALLBACK_MAP_CENTER = [20.1683, 41.1533];
const FALLBACK_MAP_ZOOM = 6;
const ACCESS_CODE = 'admin32530';
const ACCESS_STORAGE_KEY = 'atlas-dashboard-access-code';

function mergeIncidentRow(prev, updated) {
  if (!updated?.id) return prev;
  return prev.map((row) =>
    String(row.id) === String(updated.id) ? { ...row, ...updated } : row
  );
}

function mergeIncidentRows(prev, updates) {
  if (!Array.isArray(updates) || updates.length === 0) return prev;
  const updatedIds = new Set(updates.map((row) => String(row.id)));
  return prev.map((row) => {
    const updated = updates.find((item) => String(item.id) === String(row.id));
    return updated ? { ...row, ...updated } : row;
  });
}

function SuggestedTeamsBadges({ incident, compact = false, onTeamClick = null }) {
  const teams = getSuggestedTeams(incident);

  if (teams.length === 0) {
    return (
      <span
        className={`italic text-zinc-600 ${compact ? 'text-[10px]' : 'text-xs'}`}
      >
        Awaiting AI triage…
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
      {teams.map((team) => (
        <button
          key={team}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            if (onTeamClick) onTeamClick(team, incident);
          }}
          disabled={!onTeamClick}
          className={`font-bold uppercase tracking-wide border rounded-full transition-all ${getTeamBadgeClass(team)} ${
            compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2.5 py-1'
          } ${onTeamClick ? 'cursor-pointer hover:shadow-lg hover:shadow-zinc-950/50 hover:-translate-y-0.5 active:translate-y-0' : ''}`}
          type="button"
          aria-label={`Open navigation for ${team}`}
        >
          {team}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // 'connecting' | 'connected' | 'error'
  const [mapReady, setMapReady] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [clusterDrawerOpen, setClusterDrawerOpen] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [authError, setAuthError] = useState('');

  const router = useRouter();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const audioRef = useRef(null);
  const incidentsRef = useRef([]);
  const didInitialBoundsFitRef = useRef(false);
  const mapboxToken = getPublicEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN');

  const authorized = isAuthorized === true;

  incidentsRef.current = incidents;

  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? window.localStorage.getItem(ACCESS_STORAGE_KEY)
      : null;
    setIsAuthorized(saved === ACCESS_CODE);
  }, []);

  const handleLogin = (event) => {
    event.preventDefault();
    if (accessCodeInput.trim() === ACCESS_CODE) {
      window.localStorage.setItem(ACCESS_STORAGE_KEY, ACCESS_CODE);
      setIsAuthorized(true);
      setAuthError('');
      setAccessCodeInput('');
      return;
    }
    setAuthError('Access denied. Incorrect access code.');
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACCESS_STORAGE_KEY);
    }
    setIsAuthorized(false);
  };

  // Play sound for new emergency alert
  const playEmergencyAlert = () => {
    if (!audioRef.current) {
      // Create audio context for emergency alert sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      
      // Create oscillators for alarm sound (two-tone siren)
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // First tone: high frequency
      osc1.frequency.setValueAtTime(800, now);
      osc1.frequency.setValueAtTime(1200, now + 0.15);
      
      // Second tone: lower frequency
      osc2.frequency.setValueAtTime(600, now);
      osc2.frequency.setValueAtTime(900, now + 0.15);
      
      // Envelope
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    }
  };

  // Handler to open navigation modal with team dispatch coordinates
  const handleTeamBadgeClick = (team, incident) => {
    const incidentCoords = getIncidentCoordinates(incident);
    if (!incidentCoords) {
      console.warn('Incident coordinates missing or invalid');
      return;
    }

    // Get the nearest station for the selected team using normalized incident coordinates.
    const nearestStation = getNearestStation(
      incidentCoords.latitude,
      incidentCoords.longitude,
      team
    );

    if (!nearestStation) {
      console.warn('No available station found for incident', incident.id);
      return;
    }

    const stationLat = nearestStation.latitude;
    const stationLng = nearestStation.longitude;
    const incidentLat = incidentCoords.latitude;
    const incidentLng = incidentCoords.longitude;

    // Navigate to the navigation page with coordinates
    const navigationUrl = `/dashboard/navigation?from=${stationLat},${stationLng}&to=${incidentLat},${incidentLng}`;
    router.push(navigationUrl);
  };

  const handleResolveIncident = async (incident) => {
    if (!incident?.id || resolveLoading) return;
    const confirmed = window.confirm(
      `Mark incident #${incident.id} as resolved?`
    );
    if (!confirmed) return;

    setResolveLoading(true);
    try {
      const { data, error } = await supabase
        .from('incidents')
        .update({
          status: 'resolved',
        })
        .eq('id', incident.id)
        .select('*')
        .single();

      if (error) throw error;
      setIncidents((prev) => mergeIncidentRow(prev, data));
      setSelectedIncident(data);
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    } finally {
      setResolveLoading(false);
    }
  };

  const handleResolveCluster = async (members) => {
    if (!Array.isArray(members) || members.length === 0 || resolveLoading) return;
    const unresolved = members.filter(
      (member) => String(member.status).trim().toLowerCase() !== 'resolved'
    );
    if (unresolved.length === 0) return;

    const confirmed = window.confirm(
      `Resolve ${unresolved.length} incident${unresolved.length > 1 ? 's' : ''} in this group?`
    );
    if (!confirmed) return;

    const ids = unresolved.map((member) => member.id);
    setResolveLoading(true);
    try {
      const { data, error } = await supabase
        .from('incidents')
        .update({ status: 'resolved' })
        .in('id', ids)
        .select('*');

      if (error) throw error;
      setIncidents((prev) => mergeIncidentRows(prev, data));
      if (selectedIncident && ids.includes(selectedIncident.id)) {
        const updatedSelected = data.find((row) => String(row.id) === String(selectedIncident.id));
        if (updatedSelected) setSelectedIncident(updatedSelected);
      }
    } catch (err) {
      console.error('Failed to resolve cluster incidents:', err);
    } finally {
      setResolveLoading(false);
    }
  };

  const clusterMembers = selectedClusterId
    ? getClusterMembers(incidents, selectedClusterId)
    : [];

  const getIncidentSeverityScore = (incident, clusterSize = 1) => {
    if (!incident || String(incident.status).trim().toLowerCase() === 'resolved') {
      return -1;
    }

    let score = 1;
    const priority = String(incident.priority || '').trim().toLowerCase();
    const categoryText = String(incident.category || incident.title || '').trim().toLowerCase();
    const descriptionText = String(incident.description || incident.ai_summary || '').trim().toLowerCase();
    const combinedText = `${categoryText} ${descriptionText}`;

    if (priority === 'high' || priority === 'urgent' || priority === 'critical') {
      score = 3;
    } else if (priority === 'medium') {
      score = 2;
    } else if (priority === 'low') {
      score = 1;
    } else if (
      categoryText.includes('medical') ||
      categoryText.includes('fire') ||
      categoryText.includes('police') ||
      categoryText.includes('natural') ||
      categoryText.includes('disaster') ||
      categoryText.includes('rescue')
    ) {
      score = 2;
    }

    const criticalKeywords = [
      'multiple injured',
      'multiple casualties',
      'active shooter',
      'shots fired',
      'explosion',
      'building fire',
      'vehicle fire',
      'mass shooting',
      'collapse',
      'chemical',
      'hazardous',
      'unconscious',
      'trapped',
      'burning',
      'smoke',
      'fire',
    ];
    const highKeywords = [
      'injury',
      'assault',
      'robbery',
      'crash',
      'collision',
      'power line',
      'outage',
      'flood',
      'earthquake',
      'siren',
      'urgent',
      'critical',
    ];

    if (criticalKeywords.some((keyword) => combinedText.includes(keyword))) {
      score = Math.max(score, 3);
    } else if (highKeywords.some((keyword) => combinedText.includes(keyword))) {
      score = Math.max(score, 2);
    }

    if (clusterSize >= 4) {
      score = Math.max(score, 4);
    } else if (clusterSize >= 2) {
      score = Math.max(score, 3);
    }

    return Math.min(score, 4);
  };

  const getIncidentSeverity = (incident, clusterSize = 1) => {
    const status = String(incident?.status || '').trim().toLowerCase();
    if (status === 'resolved') {
      return {
        label: 'Resolved',
        badgeClass: 'bg-zinc-600/90 text-zinc-100 border-zinc-500/30',
      };
    }

    const score = getIncidentSeverityScore(incident, clusterSize);
    if (score >= 4) {
      return {
        label: 'Critical',
        badgeClass: 'bg-red-600/90 text-red-100 border-red-500/30',
      };
    }
    if (score === 3) {
      return {
        label: 'High',
        badgeClass: 'bg-orange-600/90 text-orange-100 border-orange-500/30',
      };
    }
    if (score === 2) {
      return {
        label: 'Medium',
        badgeClass: 'bg-blue-600/90 text-blue-100 border-blue-500/30',
      };
    }
    return {
      label: 'Low',
      badgeClass: 'bg-emerald-600/90 text-emerald-100 border-emerald-500/30',
    };
  };

  const getClusterSeverity = (members) => {
    if (!Array.isArray(members) || members.length === 0) {
      return {
        label: 'Unknown',
        badgeClass: 'bg-zinc-700/90 text-zinc-100 border-zinc-600/30',
      };
    }

    const scores = members.map((member) => getIncidentSeverityScore(member, members.length));
    const topScore = Math.max(...scores);
    if (topScore >= 4) {
      return {
        label: 'Critical',
        badgeClass: 'bg-red-600/90 text-red-100 border-red-500/30',
      };
    }
    if (topScore === 3) {
      return {
        label: 'High',
        badgeClass: 'bg-orange-600/90 text-orange-100 border-orange-500/30',
      };
    }
    if (topScore === 2) {
      return {
        label: 'Medium',
        badgeClass: 'bg-blue-600/90 text-blue-100 border-blue-500/30',
      };
    }
    return {
      label: 'Low',
      badgeClass: 'bg-emerald-600/90 text-emerald-100 border-emerald-500/30',
    };
  };

  const clusterSeverity = getClusterSeverity(clusterMembers);
  const selectedIncidentSeverity = selectedIncident
    ? getIncidentSeverity(selectedIncident, getClusterMembers(incidents, getClusterRootId(selectedIncident)).length)
    : null;

  const openCluster = (clusterId) => {
    setSelectedClusterId(String(clusterId));
    setClusterDrawerOpen(true);
    setSelectedIncident(null);
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  };

  const closeClusterDrawer = () => {
    setClusterDrawerOpen(false);
    setSelectedClusterId(null);
  };

  // Load existing incidents, then listen for live INSERTs (map updates via incidents state)
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    const fetchIncidents = async () => {
      try {
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        setIncidents(data || []);
        if (data?.length > 0) {
          setSelectedIncident((current) => current ?? data[0]);
        }
      } catch (err) {
        console.error('Error fetching initial incidents:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchIncidents();

    setRealtimeStatus('connecting');

    const channel = supabase
      .channel('realtime-incidents')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents' },
        (payload) => {
          console.log('New incident received live!', payload.new);
          // Play alert sound for new emergency
          playEmergencyAlert();
          setIncidents((prevIncidents) => {
            const exists = prevIncidents.some(
              (row) => String(row.id) === String(payload.new?.id)
            );
            if (exists) return prevIncidents;
            return [payload.new, ...prevIncidents];
          });
          setSelectedIncident(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'incidents' },
        (payload) => {
          const updated = payload.new;
          if (!updated?.id) return;
          console.log('Incident updated (triage):', updated.id, updated.teams_needed);
          setIncidents((prev) => mergeIncidentRow(prev, updated));
          setSelectedIncident((current) =>
            current && String(current.id) === String(updated.id)
              ? { ...current, ...updated }
              : current
          );
          if (
            selectedClusterId &&
            String(getClusterRootId(updated)) === String(selectedClusterId)
          ) {
            setClusterDrawerOpen(true);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          console.log('Supabase Realtime subscribed to incidents INSERT/UPDATE events');
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setRealtimeStatus('error');
          if (err) console.error('Supabase Realtime channel error:', err);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [authorized]);

  // 2. Initialize Mapbox GL Map once the container is in the DOM
  useEffect(() => {
    if (!authorized) return;
    if (!mapboxToken || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      center: FALLBACK_MAP_CENTER,
      zoom: FALLBACK_MAP_ZOOM,
      pitch: 60,
      bearing: -24,
      antialias: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      map.resize();
      setupIncidentLayers(map);
      setMapReady(true);
    });

    map.on('error', (e) => {
      console.error('Mapbox error:', e.error);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      setMapReady(false);
      didInitialBoundsFitRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [authorized, mapboxToken]);

  // Resize after layout changes (e.g. incident panel opens)
  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady) return;
    const id = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [authorized, selectedIncident, mapReady, loading]);

  // 3. Sync 3D pillar layers + map click handlers
  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    updateIncidentsOnMap(
      map,
      incidents,
      selectedIncident?.id ?? null,
      selectedClusterId
    );
  }, [authorized, incidents, selectedIncident, selectedClusterId, mapReady]);

  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;

    const unbindIncident = bindIncidentLayerInteraction(map, {
      onSelect: (incidentId) => {
        const incident = incidentsRef.current.find(
          (row) => String(row.id) === String(incidentId)
        );
        if (!incident) return;
        setClusterDrawerOpen(false);
        setSelectedClusterId(null);
        setSelectedIncident(incident);
      },
    });

    const unbindCluster = bindClusterLayerInteraction(map, {
      onSelectCluster: (clusterId) => {
        setSelectedClusterId(String(clusterId));
        setClusterDrawerOpen(true);
        setSelectedIncident(null);
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      },
    });

    return () => {
      unbindIncident();
      unbindCluster();
    };
  }, [authorized, mapReady]);

  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady || !selectedClusterId || !clusterDrawerOpen) {
      return;
    }
    const members = getClusterMembers(incidentsRef.current, selectedClusterId);
    if (members.length === 0) return;
    const lat =
      members.reduce((s, m) => s + m.latitude, 0) / members.length;
    const lng =
      members.reduce((s, m) => s + m.longitude, 0) / members.length;
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 17,
      pitch: 60,
      essential: true,
      speed: 1.2,
    });
  }, [selectedClusterId, clusterDrawerOpen, mapReady]);

  // 4. Fit map to incident data once (no hardcoded region)
  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady || incidents.length === 0) return;
    if (didInitialBoundsFitRef.current) return;
    didInitialBoundsFitRef.current = true;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    for (const incident of incidents) {
      const coords = getIncidentCoordinates(incident);
      if (!coords) continue;
      bounds.extend([coords.longitude, coords.latitude]);
      hasBounds = true;
    }

    if (!hasBounds) return;

    if (incidents.length === 1) {
      const only = getIncidentCoordinates(incidents[0]);
      if (!only) return;
      mapRef.current.flyTo({
        center: [only.longitude, only.latitude],
        zoom: 17,
        pitch: 60,
        essential: true,
      });
      return;
    }

    mapRef.current.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 48, right: 48 },
      maxZoom: 14,
      pitch: 60,
      duration: 1200,
    });
  }, [incidents, mapReady]);

  // 5. Fly map camera to the selected incident (skip when cluster drawer is open)
  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady || !selectedIncident || clusterDrawerOpen) return;
    const coords = getIncidentCoordinates(selectedIncident);
    if (!coords) return;

    mapRef.current.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: 17,
      pitch: 60,
      essential: true,
      speed: 1.2,
    });
  }, [selectedIncident, mapReady, clusterDrawerOpen]);

  // Popup when selecting from the sidebar list
  useEffect(() => {
    if (!authorized) return;
    if (!mapRef.current || !mapReady || !selectedIncident || clusterDrawerOpen) return;

    const coords = getIncidentCoordinates(selectedIncident);
    if (!coords) return;

    const map = mapRef.current;
    if (popupRef.current) popupRef.current.remove();

    popupRef.current = new mapboxgl.Popup({
      offset: 16,
      closeButton: true,
      maxWidth: '300px',
      className: 'incident-map-popup',
    })
      .setLngLat([coords.longitude, coords.latitude])
      .setHTML(buildPopupHTML(selectedIncident))
      .addTo(map);
  }, [selectedIncident, mapReady, clusterDrawerOpen]);

  const formatTime = (isoString) => {
    if (!isoString) return 'Just now';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
           ' (' + date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  };

  const getCategoryColor = (category = '') => {
    const cat = category.toLowerCase();
    if (cat.includes('medical')) return 'bg-red-600/90 text-red-100 border-red-500/30';
    if (cat.includes('fire')) return 'bg-orange-600/90 text-orange-100 border-orange-500/30';
    if (cat.includes('police')) return 'bg-blue-600/90 text-blue-100 border-blue-500/30';
    return 'bg-amber-600/90 text-amber-100 border-amber-500/30';
  };

  const formatSource = (source = '') => {
    const labels = {
      civilian: 'Civilian Report',
      citizen: 'Civilian Report',
      citizen_portal: 'Civilian Report',
      sensor: 'IoT Sensor',
    };
    return labels[source] || source.replace(/_/g, ' ');
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Checking access...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-10 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_64px_-32px_rgba(0,0,0,0.8)]">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-black text-white">Dashboard Login</h1>
            <p className="text-sm text-zinc-500 mt-2">Enter the access code to continue.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-xs uppercase tracking-widest text-zinc-500">Access Code</label>
            <input
              value={accessCodeInput}
              onChange={(event) => setAccessCodeInput(event.target.value)}
              type="password"
              autoComplete="off"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Enter code"
            />
            {authError && (
              <p className="text-xs text-rose-400">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
            >
              Unlock Dashboard
            </button>
          </form>
          <p className="mt-6 text-[11px] text-zinc-500">
            Access is protected by a simple code. Use the correct code to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
              <Activity className="h-5 w-5 text-red-500 animate-pulse" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
              <span className="text-2xl font-black tracking-tight text-white leading-none">
                Atlas
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 sm:border-l sm:border-zinc-800 sm:pl-3 leading-tight">
                Emergency Operations Center
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 hidden sm:inline-block">Realtime Listener:</span>
            {realtimeStatus === 'connected' ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/25">
                <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
                Live Channel Connected
              </span>
            ) : realtimeStatus === 'error' ? (
              <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/25">
                <ShieldAlert className="h-3 w-3 text-red-400" />
                Connection Error
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Subscribing...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-900 overflow-hidden">
        
        {/* Left Column: Sidebar Incoming Alerts */}
        <aside className="w-full md:w-80 lg:w-96 shrink-0 flex flex-col h-[calc(100vh-4rem)]">
          <div className="p-4 border-b border-zinc-900 bg-zinc-950/40 flex justify-between items-center shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              Incoming Alerts ({incidents.length})
            </h2>
            {incidents.length > 0 && (
              <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                Live Feed Active
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
                <span className="text-xs text-zinc-500">Loading incoming alerts...</span>
              </div>
            ) : incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-4">
                <div className="bg-zinc-900 p-4 rounded-full border border-zinc-800">
                  <Database className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-300">No Incidents Reported</h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-[200px] mx-auto">
                    Waiting for citizens to submit SOS signals from the portal.
                  </p>
                </div>
              </div>
            ) : (
              incidents.map((incident) => {
                const colorInfo = getCategoryColor(
                  incident.category || incident.title
                );
                const teams = getSuggestedTeams(incident);
                const rootId = getClusterRootId(incident);
                const clusterSize = getClusterMembers(incidents, rootId).length;
                const inCluster = isInMultiReportCluster(incidents, incident);
                const severity = getIncidentSeverity(incident, clusterSize);
                return (
                  <div
                    key={incident.id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      if (event.target !== event.currentTarget && event.target.closest('button, a')) {
                        return;
                      }
                      if (inCluster) {
                        const members = getClusterMembers(incidents, incident.id);
                        openCluster(members[0]?.id ?? rootId);
                      } else {
                        closeClusterDrawer();
                        setSelectedIncident(incident);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget && event.target.closest('button, a')) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (inCluster) {
                          const members = getClusterMembers(incidents, incident.id);
                          openCluster(members[0]?.id ?? rootId);
                        } else {
                          closeClusterDrawer();
                          setSelectedIncident(incident);
                        }
                      }
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-2.5 ${
                      selectedIncident?.id === incident.id
                        ? 'bg-zinc-900 border-zinc-700 shadow-md shadow-zinc-950'
                        : 'bg-zinc-900/30 border-zinc-900 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorInfo}`} />
                        <span className="font-bold text-sm tracking-tight text-white uppercase truncate">
                          {incident.title}
                        </span>
                        {inCluster && (
                          <span className="cluster-report-badge shrink-0 text-[9px] min-w-[1.25rem] h-5">
                            {clusterSize}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-1 italic">
                      &ldquo;{incident.description || 'No description provided'}&rdquo;
                    </p>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-600">
                        Suggested teams
                      </span>
                      <SuggestedTeamsBadges incident={incident} compact onTeamClick={handleTeamBadgeClick} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-900/60 pt-2 text-[10px] text-zinc-500 font-mono">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${severity.badgeClass}`}>
                        {severity.label}
                      </span>
                      <span className="uppercase text-zinc-400">Cluster: {clusterSize}</span>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-zinc-900/60 pt-2 text-[10px] text-zinc-500 font-mono">
                      <div className="flex items-center justify-between gap-4">
                        <span>Status: <strong className="text-zinc-300 uppercase">{incident.status === 'i_ri' ? 'New' : incident.status}</strong></span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            handleResolveIncident(incident);
                          }}
                          disabled={resolveLoading || String(incident.status).trim().toLowerCase() === 'resolved'}
                          className="rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors border border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {String(incident.status).trim().toLowerCase() === 'resolved'
                            ? 'Resolved'
                            : resolveLoading
                            ? 'Resolving'
                            : 'Resolve'}
                        </button>
                      </div>
                      <span className="uppercase">
                        {teams.length > 0 ? `${teams.length} team${teams.length > 1 ? 's' : ''}` : formatSource(incident.source)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Column: Interactive Map & Details Panel */}
        <main className="flex-1 overflow-y-auto bg-zinc-950 flex flex-col h-[calc(100vh-4rem)]">
          <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">

            {/* Mapbox — always mounted so Mapbox can initialize */}
            <div className="relative w-full h-[65%] min-h-[400px] bg-zinc-200 border-b border-zinc-900 overflow-hidden shrink-0">
              <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

              {!mapboxToken && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 text-center p-6 z-10">
                  <div className="bg-amber-500/10 p-3 rounded-full border border-amber-500/20 text-amber-500 mb-4 animate-pulse">
                    <MapIcon className="h-8 w-8" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Mapbox Token Required</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mt-2 leading-relaxed">
                    Add <code className="bg-zinc-900 text-zinc-300 px-1 py-0.5 rounded font-mono">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to <code className="text-zinc-300">.env.local</code> and restart the dev server.
                  </p>
                </div>
              )}

              {mapboxToken && !mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/80 z-10 pointer-events-none">
                  <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
                </div>
              )}

              {mapReady &&
                !selectedIncident &&
                !clusterDrawerOpen &&
                mapboxToken && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center px-4 py-2 rounded-full bg-zinc-950/75 border border-zinc-800 text-[10px] text-zinc-400 shadow-lg">
                    Click a marker or alert to view details
                  </div>
                )}

              {selectedIncident && (
                <div className="absolute bottom-4 left-4 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-[10px] font-mono shadow-xl z-10 pointer-events-none flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-red-500" /> Current Coordinates
                  </span>
                  <span>Lat: {selectedIncident.latitude.toFixed(6)}</span>
                  <span>Lng: {selectedIncident.longitude.toFixed(6)}</span>
                </div>
              )}
            </div>

          {selectedIncident ? (
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 min-h-0">
                
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-zinc-900 pb-5">
                  <div className="flex items-start gap-4">
                    <div className={`h-4 w-4 rounded-full mt-2 shrink-0 ${getCategoryColor(selectedIncident.title)}`} />
                    <div>
                      <h1 className="text-2xl font-black text-white uppercase tracking-tight">
                        {selectedIncident.title} EMERGENCY
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500 font-mono">
                          Report ID: #{selectedIncident.id} • Received: {formatTime(selectedIncident.created_at)}
                        </span>
                        {selectedIncidentSeverity && (
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${selectedIncidentSeverity.badgeClass}`}>
                            {selectedIncidentSeverity.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg">
                      {selectedIncident.status === 'i_ri' ? 'New Alert' : selectedIncident.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleResolveIncident(selectedIncident)}
                      disabled={resolveLoading || selectedIncident.status === 'resolved'}
                      className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors border border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedIncident.status === 'resolved'
                        ? 'Resolved'
                        : resolveLoading
                        ? 'Resolving...'
                        : 'Resolve Incident'}
                    </button>
                  </div>
                </div>

                {/* Detection source */}
                <div className="bg-zinc-900/30 border border-zinc-900 p-6 rounded-2xl flex flex-col gap-4">
                  <span className="text-xs uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5 border-b border-zinc-900/60 pb-3">
                    <Radio className="h-4 w-4 text-zinc-400" />
                    Detection Source
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">Source</span>
                      <span className="text-zinc-200 font-medium">{formatSource(selectedIncident.source)}</span>
                      <span className="text-[10px] text-zinc-600 font-mono block mt-1">{selectedIncident.source}</span>
                    </div>
                    {selectedIncident.sensor_type ? (
                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">Sensor Type</span>
                        <span className="text-zinc-200 font-medium">{formatSensorType(selectedIncident.sensor_type)}</span>
                      </div>
                    ) : (
                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">Sensor Type</span>
                        <span className="text-zinc-500 text-xs">Not applicable</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details Description */}
                <div className="bg-zinc-900/30 border border-zinc-900 p-6 rounded-2xl flex flex-col gap-4">
                  <span className="text-xs uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5 border-b border-zinc-900/60 pb-3">
                    <FileText className="h-4 w-4 text-zinc-400" />
                    Situation Details
                  </span>
                  <p className="text-sm text-zinc-200 leading-relaxed bg-zinc-950 p-4 rounded-xl border border-zinc-900 italic font-medium">
                    &ldquo;{selectedIncident.description || 'No additional details provided.'}&rdquo;
                  </p>
                  {selectedIncident.ai_summary && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/80 block mb-1">
                        AI Dispatcher Summary
                      </span>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {selectedIncident.ai_summary}
                      </p>
                      {(selectedIncident.priority || selectedIncident.category) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {selectedIncident.category && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {selectedIncident.category}
                            </span>
                          )}
                          {selectedIncident.priority && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25">
                              {selectedIncident.priority} priority
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Suggested dispatch teams */}
                <div className="bg-zinc-900/30 border border-zinc-900 p-6 rounded-2xl flex flex-col gap-4">
                  <span className="text-xs uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5 border-b border-zinc-900/60 pb-3">
                    <Users className="h-4 w-4 text-zinc-400" />
                    Suggested Dispatch Teams
                  </span>
                  <SuggestedTeamsBadges incident={selectedIncident} onTeamClick={handleTeamBadgeClick} />
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Generated by AI triage from the incident description. Click any team to view the live dispatch route. Dispatch only the teams listed unless scene conditions change.
                  </p>
                </div>

                {/* Actions & Coordinates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  
                  {/* Google Maps link */}
                  <div className="bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">
                        Manual Navigation
                      </span>
                      <p className="text-xs text-zinc-400">
                        Open this incident location in Google Maps for alternate routing or sharing.
                      </p>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedIncident.latitude},${selectedIncident.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-fit text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 font-bold pt-2 border-t border-zinc-900/60"
                    >
                      Launch Google Maps <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {/* EOC Dispatch Instructions */}
                  <div className="bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">
                        Dispatch Status
                      </span>
                      <p className="text-xs text-zinc-400">
                        {selectedIncident.status === 'processed'
                          ? 'AI triage complete. Assign the suggested teams below.'
                          : 'Incident logged. AI triage pending or in progress.'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-zinc-900/60">
                      <SuggestedTeamsBadges incident={selectedIncident} compact onTeamClick={handleTeamBadgeClick} />
                    </div>
                  </div>

                </div>

              </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4 min-h-0">
              <div className="bg-zinc-900/50 p-6 rounded-full border border-zinc-900">
                <Activity className="h-10 w-10 text-zinc-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-300">No Incident Selected</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-[240px]">
                  Click an alert in the sidebar to view details below the map.
                </p>
              </div>
            </div>
          )}

          </div>

          {/* replication settings instruction */}
          <div className="p-4 border-t border-zinc-900 text-[10px] text-zinc-600 bg-zinc-950 shrink-0 flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span>Ensure you have enabled Postgres replication / Realtime for the <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-500">incidents</code> table in your Supabase project settings.</span>
          </div>

        </main>

      </div>

      <ClusterDrawer
        open={clusterDrawerOpen}
        members={clusterMembers}
        reportCount={clusterMembers.length}
        clusterSeverity={clusterSeverity}
        onClose={closeClusterDrawer}
        onResolveGroup={handleResolveCluster}
        resolveLoading={resolveLoading}
      />
    </div>
  );
}
