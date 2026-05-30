import {
  canRenderMarker,
  getIncidentCoordinates,
  getMarkerStyle,
  INCIDENT_SOURCE,
} from './incidentMarkers';
import { buildMapDisplayGroups } from './incidentClusters';

export const INCIDENTS_SOURCE_ID = 'incidents';
export const INCIDENTS_PILLAR_LAYER_ID = 'incidents-3d-pillars';
export const INCIDENTS_GLOW_LAYER_ID = 'incidents-ground-glow';

export const CLUSTERS_SOURCE_ID = 'incident-clusters';
export const CLUSTERS_GLOW_LAYER_ID = 'incident-clusters-glow';
export const CLUSTERS_PILLAR_LAYER_ID = 'incident-clusters-pillars';
export const CLUSTERS_COUNT_LAYER_ID = 'incident-clusters-count';

/** Meters → degree offset at a given latitude. */
function metersToDegreeOffset(latitude, meters) {
  const latOffset = meters / 111320;
  const lngOffset = meters / (111320 * Math.cos((latitude * Math.PI) / 180));
  return { latOffset, lngOffset };
}

/** Small square footprint for a 3D extruded pillar. */
export function createPillarRing(longitude, latitude, meters = 6) {
  const { latOffset, lngOffset } = metersToDegreeOffset(latitude, meters);
  return [
    [longitude - lngOffset, latitude - latOffset],
    [longitude + lngOffset, latitude - latOffset],
    [longitude + lngOffset, latitude + latOffset],
    [longitude - lngOffset, latitude + latOffset],
    [longitude - lngOffset, latitude - latOffset],
  ];
}

/** GeoJSON for unclustered single-report 3D pillars + glow. */
export function buildIncidentsGeoJSON(incidents, selectedId = null) {
  const features = [];

  for (const incident of incidents) {
    if (!canRenderMarker(incident)) continue;

    const coords = getIncidentCoordinates(incident);
    if (!coords) continue;

    const style = getMarkerStyle(incident);
    const isSelected =
      selectedId != null && String(incident.id) === String(selectedId);
    const isSensor = style.sourceType === INCIDENT_SOURCE.SENSOR;

    const footprint = isSensor ? 7 : 5.5;
    const height = isSensor
      ? isSelected
        ? 100
        : 72
      : isSelected
        ? 82
        : 56;

    features.push({
      type: 'Feature',
      id: `pillar-${incident.id}`,
      geometry: {
        type: 'Polygon',
        coordinates: [createPillarRing(coords.longitude, coords.latitude, footprint)],
      },
      properties: {
        id: incident.id,
        color: isSelected ? style.light : style.fill,
        height,
        selected: isSelected,
        sourceType: style.sourceType,
        category: style.category,
      },
    });

    features.push({
      type: 'Feature',
      id: `glow-${incident.id}`,
      properties: {
        id: incident.id,
        color: style.fill,
        selected: isSelected,
      },
      geometry: {
        type: 'Point',
        coordinates: [coords.longitude, coords.latitude],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** GeoJSON for macro-incident cluster markers (multi-report). */
export function buildClustersGeoJSON(clusters, selectedClusterId = null) {
  const features = [];

  for (const cluster of clusters) {
    const isSelected =
      selectedClusterId != null &&
      String(cluster.clusterId) === String(selectedClusterId);
    const style = getMarkerStyle(cluster.primary);
    const footprint = 12;
    const height = isSelected ? 110 : 88;

    features.push({
      type: 'Feature',
      id: `cluster-pillar-${cluster.clusterId}`,
      geometry: {
        type: 'Polygon',
        coordinates: [
          createPillarRing(cluster.longitude, cluster.latitude, footprint),
        ],
      },
      properties: {
        clusterId: cluster.clusterId,
        reportCount: cluster.reportCount,
        color: isSelected ? style.light : style.fill,
        height,
        selected: isSelected,
      },
    });

    features.push({
      type: 'Feature',
      id: `cluster-glow-${cluster.clusterId}`,
      geometry: {
        type: 'Point',
        coordinates: [cluster.longitude, cluster.latitude],
      },
      properties: {
        clusterId: cluster.clusterId,
        reportCount: cluster.reportCount,
        color: style.fill,
        selected: isSelected,
      },
    });

    features.push({
      type: 'Feature',
      id: `cluster-count-${cluster.clusterId}`,
      geometry: {
        type: 'Point',
        coordinates: [cluster.longitude, cluster.latitude],
      },
      properties: {
        clusterId: cluster.clusterId,
        reportCount: cluster.reportCount,
        selected: isSelected,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Register incident source + 3D layers (call once after map style loads). */
export function setupIncidentLayers(map) {
  if (!map) return;

  if (!map.getSource(INCIDENTS_SOURCE_ID)) {
    map.addSource(INCIDENTS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'id',
    });

    map.addLayer({
      id: INCIDENTS_GLOW_LAYER_ID,
      type: 'circle',
      source: INCIDENTS_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          14,
          10,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.28,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.85)',
        'circle-pitch-alignment': 'map',
      },
    });

    map.addLayer({
      id: INCIDENTS_PILLAR_LAYER_ID,
      type: 'fill-extrusion',
      source: INCIDENTS_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    });
  }

  if (!map.getSource(CLUSTERS_SOURCE_ID)) {
    map.addSource(CLUSTERS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'clusterId',
    });

    map.addLayer({
      id: CLUSTERS_GLOW_LAYER_ID,
      type: 'circle',
      source: CLUSTERS_SOURCE_ID,
      filter: [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['has', 'color'],
      ],
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          22,
          18,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.35,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-pitch-alignment': 'map',
      },
    });

    map.addLayer({
      id: CLUSTERS_PILLAR_LAYER_ID,
      type: 'fill-extrusion',
      source: CLUSTERS_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    });

    map.addLayer({
      id: CLUSTERS_COUNT_LAYER_ID,
      type: 'symbol',
      source: CLUSTERS_SOURCE_ID,
      filter: [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['has', 'reportCount'],
        ['!', ['has', 'color']],
      ],
      layout: {
        'text-field': ['to-string', ['get', 'reportCount']],
        'text-size': 16,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0,0,0,0.9)',
        'text-halo-width': 2.5,
      },
    });
  }
}

export function updateIncidentsOnMap(
  map,
  incidents,
  selectedId = null,
  selectedClusterId = null
) {
  if (!map) return;

  const { singletons, clusters } = buildMapDisplayGroups(incidents);

  const incidentSource = map.getSource(INCIDENTS_SOURCE_ID);
  if (incidentSource) {
    incidentSource.setData(buildIncidentsGeoJSON(singletons, selectedId));
  }

  const clusterSource = map.getSource(CLUSTERS_SOURCE_ID);
  if (clusterSource) {
    clusterSource.setData(buildClustersGeoJSON(clusters, selectedClusterId));
  }
}

export function bindIncidentLayerInteraction(map, { onSelect }) {
  if (!map) return () => {};

  const layerIds = [INCIDENTS_PILLAR_LAYER_ID, INCIDENTS_GLOW_LAYER_ID];

  const handleClick = (e) => {
    const feature = e.features?.[0];
    if (!feature?.properties?.id) return;
    onSelect(feature.properties.id);
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = '';
  };

  for (const layerId of layerIds) {
    map.on('click', layerId, handleClick);
    map.on('mouseenter', layerId, handleEnter);
    map.on('mouseleave', layerId, handleLeave);
  }

  return () => {
    for (const layerId of layerIds) {
      map.off('click', layerId, handleClick);
      map.off('mouseenter', layerId, handleEnter);
      map.off('mouseleave', layerId, handleLeave);
    }
  };
}

export function bindClusterLayerInteraction(map, { onSelectCluster }) {
  if (!map) return () => {};

  const layerIds = [
    CLUSTERS_PILLAR_LAYER_ID,
    CLUSTERS_GLOW_LAYER_ID,
    CLUSTERS_COUNT_LAYER_ID,
  ];

  const handleClick = (e) => {
    const feature = e.features?.[0];
    const clusterId = feature?.properties?.clusterId;
    if (clusterId == null) return;
    onSelectCluster(clusterId);
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = '';
  };

  for (const layerId of layerIds) {
    map.on('click', layerId, handleClick);
    map.on('mouseenter', layerId, handleEnter);
    map.on('mouseleave', layerId, handleLeave);
  }

  return () => {
    for (const layerId of layerIds) {
      map.off('click', layerId, handleClick);
      map.off('mouseenter', layerId, handleEnter);
      map.off('mouseleave', layerId, handleLeave);
    }
  };
}
