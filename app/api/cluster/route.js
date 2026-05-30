import { supabase } from '@/lib/supabaseClient';
import { boundingBox, distanceMeters } from '@/lib/geo';
import { evaluateSameEvent } from '@/lib/clusterMatch';

const PROXIMITY_RADIUS_METERS = 100;
/** Same map pin / GPS — auto-link without Gemini (still uses Gemini from 25m–100m). */
const SAME_SPOT_METERS = 25;
const ACTIVE_STATUSES = ['i_ri', 'processed'];

function getClusterRootId(incident) {
  return incident.cluster_id ?? incident.id;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const incidentId = body?.incidentId;

    if (incidentId == null || incidentId === '') {
      return Response.json({ error: 'incidentId is required' }, { status: 400 });
    }

    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', incidentId)
      .single();

    if (fetchError || !incident) {
      return Response.json(
        { error: fetchError?.message || 'Incident not found' },
        { status: 404 }
      );
    }

    if (incident.cluster_id) {
      return Response.json({
        success: true,
        clustered: true,
        clusterId: incident.cluster_id,
        message: 'Incident already assigned to a cluster',
        incident,
      });
    }

    const { minLat, maxLat, minLng, maxLng } = boundingBox(
      incident.latitude,
      incident.longitude,
      PROXIMITY_RADIUS_METERS
    );

    const { data: candidates, error: candidatesError } = await supabase
      .from('incidents')
      .select('*')
      .neq('id', incident.id)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng)
      .in('status', ACTIVE_STATUSES);

    if (candidatesError) {
      return Response.json(
        { error: candidatesError.message || 'Failed to query nearby incidents' },
        { status: 500 }
      );
    }

    const nearby = (candidates || []).filter((row) => {
      const dist = distanceMeters(
        incident.latitude,
        incident.longitude,
        row.latitude,
        row.longitude
      );
      return dist <= PROXIMITY_RADIUS_METERS;
    });

    if (nearby.length === 0) {
      return Response.json({
        success: true,
        clustered: false,
        clusterId: null,
        message: 'No nearby incidents within 100 meters',
        incident,
      });
    }

    const nearbyByDistance = [...nearby].sort((a, b) => {
      const da = distanceMeters(
        incident.latitude,
        incident.longitude,
        a.latitude,
        a.longitude
      );
      const db = distanceMeters(
        incident.latitude,
        incident.longitude,
        b.latitude,
        b.longitude
      );
      return da - db;
    });

    const triedRoots = new Set();

    async function assignToCluster(primary, matchReasoning, matchMethod) {
      const clusterId = getClusterRootId(primary);

      const { data: updated, error: updateError } = await supabase
        .from('incidents')
        .update({ cluster_id: clusterId })
        .eq('id', incident.id)
        .select()
        .single();

      if (updateError) {
        return Response.json(
          { error: updateError.message || 'Failed to assign cluster_id' },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        clustered: true,
        clusterId,
        matchReasoning,
        matchMethod,
        matchedPrimaryId: clusterId,
        incident: updated,
      });
    }

    for (const candidate of nearbyByDistance) {
      const rootId = String(getClusterRootId(candidate));
      if (triedRoots.has(rootId)) continue;
      triedRoots.add(rootId);

      let primary = candidate;
      if (candidate.cluster_id) {
        const rootInNearby = nearby.find((c) => String(c.id) === rootId);
        if (rootInNearby) {
          primary = rootInNearby;
        } else {
          const { data: rootRow } = await supabase
            .from('incidents')
            .select('*')
            .eq('id', rootId)
            .maybeSingle();
          if (rootRow) primary = rootRow;
        }
      }

      const dist = distanceMeters(
        incident.latitude,
        incident.longitude,
        primary.latitude,
        primary.longitude
      );

      if (dist <= SAME_SPOT_METERS) {
        return assignToCluster(
          primary,
          `Reports are within ${Math.round(dist)}m (same map location).`,
          'proximity'
        );
      }

      const { match, reasoning } = await evaluateSameEvent(incident, primary);

      if (!match) continue;

      return assignToCluster(primary, reasoning, 'gemini');
    }

    return Response.json({
      success: true,
      clustered: false,
      clusterId: null,
      message: 'Nearby incidents found but Gemini determined they are different events',
      incident,
      nearbyChecked: nearby.length,
    });
  } catch (err) {
    console.error('Cluster API error:', err);
    return Response.json(
      { error: err?.message || 'Clustering failed' },
      { status: 500 }
    );
  }
}
