/** Normalize teams_needed from Supabase (text[] or legacy string). */
export function getSuggestedTeams(incident) {
  const raw = incident?.teams_needed;
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed)
          ? parsed.map((t) => String(t).trim()).filter(Boolean)
          : [];
      } catch {
        return [];
      }
    }
    return trimmed
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((t) => t.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
  }

  return [];
}

export const TEAM_BADGE_STYLES = {
  Police: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Ambulance: 'bg-red-500/15 text-red-300 border-red-500/30',
  Firefighters: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
};

export function getTeamBadgeClass(team) {
  return TEAM_BADGE_STYLES[team] || 'bg-zinc-800/80 text-zinc-300 border-zinc-600/40';
}
