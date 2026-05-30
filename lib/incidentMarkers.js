/**
 * Incident map marker identification and DOM rendering.
 * Uses explicit checks on incident.source, incident.title, and incident.category.
 */

import { getSuggestedTeams } from './incidentTeams';

export const INCIDENT_SOURCE = {
  CIVILIAN: 'civilian',
  SENSOR: 'sensor',
};

export const SENSOR_TYPE = {
  FIRE_DETECTOR: 'fire_detector',
  HYDROSENSOR: 'hydrosensor',
  SEISMIC_SENSOR: 'seismic_sensor',
};

export const INCIDENT_CATEGORY = {
  MEDICAL: 'medical',
  FIRE: 'fire',
  POLICE: 'police',
  NATURAL_DISASTER: 'natural_disaster',
  UNKNOWN: 'unknown',
  RESOLVED: 'resolved',
};

const CATEGORY_LABELS = {
  [INCIDENT_CATEGORY.MEDICAL]: 'Medical',
  [INCIDENT_CATEGORY.FIRE]: 'Fire',
  [INCIDENT_CATEGORY.POLICE]: 'Police',
  [INCIDENT_CATEGORY.NATURAL_DISASTER]: 'Natural Disaster',
  [INCIDENT_CATEGORY.UNKNOWN]: 'General',
  [INCIDENT_CATEGORY.RESOLVED]: 'Resolved',
};

const SOURCE_LABELS = {
  [INCIDENT_SOURCE.CIVILIAN]: 'Civilian Report',
  [INCIDENT_SOURCE.SENSOR]: 'IoT Sensor Alert',
};

const SENSOR_TYPE_LABELS = {
  [SENSOR_TYPE.FIRE_DETECTOR]: 'Fire Detector',
  [SENSOR_TYPE.HYDROSENSOR]: 'Hydrosensor',
  [SENSOR_TYPE.SEISMIC_SENSOR]: 'Seismic Sensor',
};

/** Normalize source string (DB: civilian | sensor). Legacy aliases supported. */
export function normalizeSource(source) {
  if (typeof source !== 'string') return null;
  const value = source.trim().toLowerCase();
  if (value === 'civilian' || value === 'citizen' || value === 'citizen_portal') {
    return INCIDENT_SOURCE.CIVILIAN;
  }
  if (value === 'sensor') {
    return INCIDENT_SOURCE.SENSOR;
  }
  return null;
}

export function formatSensorType(sensorType) {
  if (typeof sensorType !== 'string' || sensorType.trim() === '') {
    return 'Unspecified';
  }
  const key = sensorType.trim().toLowerCase();
  return SENSOR_TYPE_LABELS[key] || sensorType.replace(/_/g, ' ');
}

/** Resolve category from sensor_type, incident.category, or incident.title. */
export function getCategoryFromIncident(incident) {
  if (!incident || typeof incident !== 'object') {
    return INCIDENT_CATEGORY.UNKNOWN;
  }

  const sourceType = normalizeSource(incident.source);
  if (sourceType === INCIDENT_SOURCE.SENSOR) {
    const sensorType =
      typeof incident.sensor_type === 'string'
        ? incident.sensor_type.trim().toLowerCase()
        : '';
    if (sensorType === SENSOR_TYPE.FIRE_DETECTOR) {
      return INCIDENT_CATEGORY.FIRE;
    }
    if (sensorType === SENSOR_TYPE.HYDROSENSOR) {
      return INCIDENT_CATEGORY.NATURAL_DISASTER;
    }
    if (sensorType === SENSOR_TYPE.SEISMIC_SENSOR) {
      return INCIDENT_CATEGORY.NATURAL_DISASTER;
    }
  }

  let label = '';
  if (typeof incident.category === 'string' && incident.category.trim() !== '') {
    label = incident.category;
  } else if (typeof incident.title === 'string' && incident.title.trim() !== '') {
    label = incident.title;
  }

  const normalized = label.trim().toLowerCase();
  if (normalized.includes('medical')) return INCIDENT_CATEGORY.MEDICAL;
  if (normalized.includes('fire')) return INCIDENT_CATEGORY.FIRE;
  if (normalized.includes('police')) return INCIDENT_CATEGORY.POLICE;
  if (
    normalized.includes('natural') ||
    normalized.includes('disaster') ||
    normalized.includes('rescue')
  ) {
    return INCIDENT_CATEGORY.NATURAL_DISASTER;
  }

  return INCIDENT_CATEGORY.UNKNOWN;
}

/** Modern marker colors — civilian pins and sensor beacons. */
export function getMarkerStyle(incident) {
  const sourceType = normalizeSource(incident?.source);
  const status = typeof incident?.status === 'string' ? incident.status.trim().toLowerCase() : '';
  const category = getCategoryFromIncident(incident);

  const resolvedStyle = {
    fill: '#6b7280',
    light: '#9ca3af',
    glow: 'rgba(156, 163, 175, 0.32)',
  };

  const civilianColors = {
    [INCIDENT_CATEGORY.MEDICAL]: { fill: '#dc2626', light: '#f87171', glow: 'rgba(220, 38, 38, 0.38)' },
    [INCIDENT_CATEGORY.FIRE]: { fill: '#ea580c', light: '#fb923c', glow: 'rgba(234, 88, 12, 0.38)' },
    [INCIDENT_CATEGORY.POLICE]: { fill: '#2563eb', light: '#60a5fa', glow: 'rgba(37, 99, 235, 0.38)' },
    [INCIDENT_CATEGORY.NATURAL_DISASTER]: { fill: '#16a34a', light: '#4ade80', glow: 'rgba(22, 163, 74, 0.35)' },
    [INCIDENT_CATEGORY.UNKNOWN]: { fill: '#8b5cf6', light: '#c4b5fd', glow: 'rgba(139, 92, 246, 0.32)' },
  };

  const sensorColors = {
    [INCIDENT_CATEGORY.MEDICAL]: { fill: '#ef4444', light: '#fca5a5', glow: 'rgba(239, 68, 68, 0.45)' },
    [INCIDENT_CATEGORY.FIRE]: { fill: '#f97316', light: '#fdba74', glow: 'rgba(249, 115, 22, 0.45)' },
    [INCIDENT_CATEGORY.POLICE]: { fill: '#3b82f6', light: '#93c5fd', glow: 'rgba(59, 130, 246, 0.45)' },
    [INCIDENT_CATEGORY.NATURAL_DISASTER]: { fill: '#22c55e', light: '#86efac', glow: 'rgba(34, 197, 94, 0.35)' },
    [INCIDENT_CATEGORY.UNKNOWN]: { fill: '#8b5cf6', light: '#c4b5fd', glow: 'rgba(139, 92, 246, 0.32)' },
  };

  if (status === 'resolved') {
    return {
      sourceType,
      category: INCIDENT_CATEGORY.RESOLVED,
      fill: resolvedStyle.fill,
      light: resolvedStyle.light,
      glow: resolvedStyle.glow,
      shape: sourceType === INCIDENT_SOURCE.SENSOR ? 'beacon' : 'pin',
      pulseSpeed: 'normal',
    };
  }

  const palette =
    sourceType === INCIDENT_SOURCE.SENSOR ? sensorColors : civilianColors;

  const colors = palette[category] || palette[INCIDENT_CATEGORY.UNKNOWN];

  return {
    sourceType,
    category,
    fill: colors.fill,
    light: colors.light,
    glow: colors.glow,
    shape: sourceType === INCIDENT_SOURCE.SENSOR ? 'beacon' : 'pin',
    pulseSpeed: sourceType === INCIDENT_SOURCE.SENSOR ? 'fast' : 'normal',
  };
}

/** Parse latitude/longitude from DB (number or string). */
export function parseCoordinate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Fix common seed-data mistake: longitude stored as latitude (Balkans / Kosovo region).
 * Valid there: lat ~39–43, lng ~19–22.
 */
export function correctSwappedCoordinates(latitude, longitude) {
  const looksSwapped =
    latitude >= 18 &&
    latitude <= 28 &&
    longitude >= 38 &&
    longitude <= 47;

  if (looksSwapped) {
    return { latitude: longitude, longitude: latitude, wasSwapped: true };
  }

  return { latitude, longitude, wasSwapped: false };
}

/** Resolved coordinates from incident row, or null if invalid. */
export function getIncidentCoordinates(incident) {
  if (!incident || typeof incident !== 'object') return null;

  let latitude = parseCoordinate(incident.latitude);
  let longitude = parseCoordinate(incident.longitude);

  if (latitude === null || longitude === null) return null;

  const corrected = correctSwappedCoordinates(latitude, longitude);
  latitude = corrected.latitude;
  longitude = corrected.longitude;

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

export function hasValidCoordinates(incident) {
  return getIncidentCoordinates(incident) !== null;
}

export function canRenderMarker(incident) {
  return hasValidCoordinates(incident) && normalizeSource(incident.source) !== null;
}

/** Mapbox LngLat for HTML markers (2D ground plane — no terrain altitude). */
export function getMarkerLngLat(longitude, latitude) {
  return { lng: longitude, lat: latitude };
}

/** Pin uses bottom anchor; beacon uses center. */
export function getMarkerAnchor(incident) {
  const style = getMarkerStyle(incident);
  return style.shape === 'beacon' ? 'center' : 'bottom';
}

/** Build marker root element with pulse ring and shape. */
export function createMarkerElement(incident, isSelected = false) {
  const style = getMarkerStyle(incident);
  const el = document.createElement('div');
  el.className = buildMarkerClassName(style, isSelected);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', buildAriaLabel(incident, style));
  el.style.setProperty('--marker-color', style.fill);
  el.style.setProperty('--marker-light', style.light);
  el.style.setProperty('--marker-glow', style.glow);

  const pulse = document.createElement('div');
  pulse.className = 'incident-marker__pulse';
  el.appendChild(pulse);

  const shape = document.createElement('div');
  shape.className =
    style.shape === 'beacon'
      ? 'incident-marker__shape incident-marker__shape--beacon'
      : 'incident-marker__shape incident-marker__shape--pin';
  el.appendChild(shape);

  return el;
}

export function updateMarkerElement(element, incident, isSelected = false) {
  if (!element) return;
  const style = getMarkerStyle(incident);
  element.className = buildMarkerClassName(style, isSelected);
  element.setAttribute('aria-label', buildAriaLabel(incident, style));
  element.style.setProperty('--marker-color', style.fill);
  element.style.setProperty('--marker-light', style.light);
  element.style.setProperty('--marker-glow', style.glow);
}

function buildMarkerClassName(style, isSelected) {
  const classes = [
    'incident-marker',
    style.sourceType === INCIDENT_SOURCE.SENSOR
      ? 'incident-marker--sensor'
      : 'incident-marker--civilian',
    `incident-marker--${style.category}`,
    style.pulseSpeed === 'fast' ? 'incident-marker--pulse-fast' : 'incident-marker--pulse-normal',
  ];
  if (isSelected) classes.push('incident-marker--selected');
  return classes.join(' ');
}

function buildAriaLabel(incident, style) {
  const categoryLabel = CATEGORY_LABELS[style.category] || 'General';
  const sourceLabel =
    style.sourceType === INCIDENT_SOURCE.SENSOR
      ? SOURCE_LABELS[INCIDENT_SOURCE.SENSOR]
      : SOURCE_LABELS[INCIDENT_SOURCE.CIVILIAN];
  const title =
    typeof incident.title === 'string' && incident.title.trim() !== ''
      ? incident.title
      : 'Incident';
  return `${sourceLabel}, ${categoryLabel}: ${title}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPopupTime(isoString) {
  if (typeof isoString !== 'string' || isoString.trim() === '') {
    return 'Unknown time';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** English popup HTML for Mapbox GL Popup. */
export function buildPopupHTML(incident) {
  const style = getMarkerStyle(incident);
  const sourceType = normalizeSource(incident?.source);
  const category = getCategoryFromIncident(incident);

  const title =
    typeof incident.title === 'string' && incident.title.trim() !== ''
      ? escapeHtml(incident.title)
      : 'Untitled Incident';

  const description =
    typeof incident.description === 'string' && incident.description.trim() !== ''
      ? escapeHtml(incident.description)
      : 'No description provided.';

  const status =
    typeof incident.status === 'string' && incident.status.trim() !== ''
      ? escapeHtml(incident.status === 'i_ri' ? 'New' : incident.status)
      : 'Unknown';

  const sourceLabel =
    sourceType === INCIDENT_SOURCE.SENSOR
      ? SOURCE_LABELS[INCIDENT_SOURCE.SENSOR]
      : SOURCE_LABELS[INCIDENT_SOURCE.CIVILIAN];

  const categoryLabel = CATEGORY_LABELS[category] || 'General';

  let sensorLine = '';
  if (sourceType === INCIDENT_SOURCE.SENSOR) {
    sensorLine = `<p class="incident-popup__row"><span class="incident-popup__label">Sensor</span> ${escapeHtml(formatSensorType(incident.sensor_type))}</p>`;
  }

  const teams = getSuggestedTeams(incident);
  const teamsLine =
    teams.length > 0
      ? `<p class="incident-popup__row"><span class="incident-popup__label">Teams</span> ${escapeHtml(teams.join(', '))}</p>`
      : '';

  return `
    <div class="incident-popup" style="--popup-accent: ${style.fill}">
      <p class="incident-popup__badge">${sourceLabel}</p>
      <h3 class="incident-popup__title">${title}</h3>
      <p class="incident-popup__category">${categoryLabel} Emergency</p>
      <p class="incident-popup__desc">${description}</p>
      ${sensorLine}
      ${teamsLine}
      <p class="incident-popup__row"><span class="incident-popup__label">Status</span> ${status}</p>
      <p class="incident-popup__row"><span class="incident-popup__label">Reported</span> ${formatPopupTime(incident.created_at)}</p>
    </div>
  `;
}
