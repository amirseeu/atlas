import { getIncidentCoordinates } from './incidentMarkers';
import { centroidFromCoords, distanceMeters } from './geo';

/** Map/UI: merge co-located reports within this radius (meters). */
export const DISPLAY_PROXIMITY_METERS = 30;

/** Root id for a row: primary incident id for the macro-incident. */
export function getClusterRootId(incident) {
  if (!incident?.id) return null;
  return incident.cluster_id ?? incident.id;
}

function sortByCreatedAt(members) {
  return [...members].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

function buildClusterEntry(rootId, members) {
  const sorted = sortByCreatedAt(members);
  const primary = sorted.find((m) => String(m.id) === String(rootId)) ?? sorted[0];
  const coordsList = sorted.map(getIncidentCoordinates).filter(Boolean);
  const centroid = centroidFromCoords(coordsList);
  const anchor = getIncidentCoordinates(primary) ?? centroid;

  if (!anchor) return null;

  return {
    clusterId: String(rootId),
    primary,
    members: sorted,
    reportCount: sorted.length,
    latitude: centroid?.latitude ?? anchor.latitude,
    longitude: centroid?.longitude ?? anchor.longitude,
  };
}

/** Group unlinked singletons that share the same map location. */
function mergeSpatialSingletons(singletons) {
  const remaining = [...singletons];
  const mergedClusters = [];
  const stillSingletons = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    const group = [seed];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const other = remaining[i];
      const dist = distanceMeters(
        seed.latitude,
        seed.longitude,
        other.latitude,
        other.longitude
      );
      if (dist <= DISPLAY_PROXIMITY_METERS) {
        group.push(other);
        remaining.splice(i, 1);
      }
    }

    if (group.length > 1) {
      const sorted = sortByCreatedAt(group);
      const entry = buildClusterEntry(String(sorted[0].id), sorted);
      if (entry) mergedClusters.push(entry);
    } else {
      stillSingletons.push(seed);
    }
  }

  return { clusters: mergedClusters, singletons: stillSingletons };
}

/**
 * Partition incidents for the map: one marker per cluster (with count badge),
 * individual pillars only for truly isolated reports.
 */
export function buildMapDisplayGroups(incidents) {
  const rootGroups = new Map();

  for (const incident of incidents) {
    const rootId = String(getClusterRootId(incident));
    if (!rootGroups.has(rootId)) rootGroups.set(rootId, []);
    rootGroups.get(rootId).push(incident);
  }

  const dbClusters = [];
  const pendingSingletons = [];

  for (const [rootId, members] of rootGroups) {
    const hasDbLink = members.some((m) => m.cluster_id != null);
    if (members.length > 1 || hasDbLink) {
      const entry = buildClusterEntry(rootId, members);
      if (entry) dbClusters.push(entry);
    } else {
      pendingSingletons.push(members[0]);
    }
  }

  const { clusters: spatialClusters, singletons } =
    mergeSpatialSingletons(pendingSingletons);

  return {
    singletons,
    clusters: [...dbClusters, ...spatialClusters],
  };
}

/** All reports in the same map cluster (DB-linked or co-located). */
export function getClusterMembers(incidents, clusterId) {
  const id = String(clusterId);
  const { clusters } = buildMapDisplayGroups(incidents);

  const byClusterId = clusters.find((c) => String(c.clusterId) === id);
  if (byClusterId) return byClusterId.members;

  const byMember = clusters.find((c) =>
    c.members.some((m) => String(m.id) === id)
  );
  if (byMember) return byMember.members;

  const row = incidents.find((inc) => String(inc.id) === id);
  return row ? [row] : [];
}

/** Whether this row is part of a multi-report cluster on the map. */
export function isInMultiReportCluster(incidents, incident) {
  return getClusterMembers(incidents, incident.id).length > 1;
}
