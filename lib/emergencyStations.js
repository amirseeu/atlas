/**
 * Station/Emergency Services Locations
 * These represent the primary dispatch stations for emergency services
 */

export const EMERGENCY_STATIONS = [
  {
    id: 'euc_tetovo_police',
    name: 'Tetovo Police Station',
    latitude: 42.0082096,
    longitude: 20.964768,
    address: '2X57+7WJ, Tetovo 1220',
    phone: '044 334 460',
    type: 'Police Station',
    teams: ['Police'],
  },
  {
    id: 'euc_tetovo_ambulance',
    name: 'Dual-Med Ambulance Service',
    latitude: 42.0067514,
    longitude: 20.9712571,
    address: 'Jane Sandanski 40, Tetovo 1220 MK',
    phone: '070 532 786',
    type: 'Ambulance Service',
    teams: ['Ambulance'],
  },
  {
    id: 'euc_tetovo_fire',
    name: 'Tetovo Fire Brigade (ТППЕ)',
    latitude: 42.0000,
    longitude: 20.9700,
    address: 'Industriska b.b., Tetovo 1200',
    phone: null,
    type: 'Fire Station',
    teams: ['Firefighters'],
  },
  {
    id: 'euc_tetovo_support',
    name: 'Tetovo Regional Support Station',
    latitude: 42.0100,
    longitude: 20.9730,
    address: 'Cvetan Dimov 3, Tetovo',
    phone: null,
    type: 'Regional Support',
    teams: ['Police', 'Ambulance', 'Firefighters'],
  },
];

/**
 * Find the nearest emergency station to the given incident coordinates
 * @param {number} incidentLat - Incident latitude
 * @param {number} incidentLng - Incident longitude
 * @param {string[]} teamFilter - Optional: filter stations by team availability
 * @returns {Object} The nearest station object with coordinates
 */
const TEAM_CANONICAL = {
  police: 'Police',
  ambulance: 'Ambulance',
  firefighters: 'Firefighters',
  fire: 'Firefighters',
  rescue: 'Firefighters',
  medical: 'Ambulance',
  hospital: 'Ambulance',
  medic: 'Ambulance',
  ems: 'Ambulance',
  'fire station': 'Firefighters',
  'firestation': 'Firefighters',
};

function normalizeTeamFilter(teamFilter) {
  if (Array.isArray(teamFilter)) {
    return teamFilter
      .map((team) => normalizeTeamFilter(team))
      .flat()
      .filter(Boolean);
  }

  if (typeof teamFilter !== 'string' || !teamFilter.trim()) {
    return [];
  }

  const normalized = teamFilter.trim().toLowerCase();
  if (TEAM_CANONICAL[normalized]) {
    return [TEAM_CANONICAL[normalized]];
  }

  const exact = Object.values(TEAM_CANONICAL).find(
    (canonical) => canonical.toLowerCase() === normalized
  );

  return exact ? [exact] : [];
}

export function getNearestStation(incidentLat, incidentLng, teamFilter = null) {
  const lat = Number(incidentLat);
  const lng = Number(incidentLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    // Invalid coordinates should not silently route from the default Tetovo station.
    return null;
  }

  let availableStations = EMERGENCY_STATIONS;

  const normalizedTeams = normalizeTeamFilter(teamFilter);
  if (normalizedTeams.length > 0) {
    availableStations = EMERGENCY_STATIONS.filter((station) =>
      station.teams.some((team) => normalizedTeams.includes(team))
    );
  } else if (teamFilter != null) {
    return null;
  }

  if (availableStations.length === 0) {
    return null;
  }

  // Calculate haversine distance for each station
  const stationsWithDistance = availableStations.map((station) => ({
    ...station,
    distance: haversineDistance(
      lat,
      lng,
      station.latitude,
      station.longitude
    ),
  }));

  // Return the station with the minimum distance
  return stationsWithDistance.reduce((nearest, current) =>
    current.distance < nearest.distance ? current : nearest
  );
}

/**
 * Haversine distance formula (in kilometers)
 * @param {number} lat1 - Origin latitude
 * @param {number} lon1 - Origin longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format station name for display (dispatch header)
 * @param {string} teamName - The team name
 * @param {Object} station - The station object
 * @returns {string} Formatted dispatch header
 */
export function formatDispatchHeader(teamName, station) {
  return `Routing ${teamName} from ${station.name} to Emergency Incident`;
}
