'use client';

import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Clock, MapPin } from 'lucide-react';
import { getSuggestedTeams } from '@/lib/incidentTeams';
import './cluster-drawer.css';

function formatReportTime(isoString) {
  if (!isoString) return 'Unknown time';
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccordionReport({ report, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const teams = getSuggestedTeams(report);

  return (
    <div className="cluster-accordion__item">
      <button
        type="button"
        className="cluster-accordion__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-300">
            {report.title || 'Report'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {formatReportTime(report.created_at)}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="cluster-accordion__panel space-y-3">
          <p className="text-sm text-zinc-300 leading-relaxed italic">
            &ldquo;{report.description || 'No description provided.'}&rdquo;
          </p>
          {report.ai_summary && (
            <p className="text-xs text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
              <span className="font-bold uppercase text-[10px] block mb-1">
                AI Summary
              </span>
              {report.ai_summary}
            </p>
          )}
          {teams.length > 0 && (
            <p className="text-[10px] text-zinc-500">
              <span className="font-bold uppercase">Suggested teams: </span>
              {teams.join(', ')}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 font-mono">
            Report ID #{report.id}
            {report.cluster_id ? ` · Linked to cluster #${report.cluster_id}` : ' · Primary report'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ClusterDrawer({
  open,
  members,
  reportCount,
  clusterSeverity,
  onClose,
  onResolveGroup,
  resolveLoading,
}) {
  if (!open || !members?.length) return null;

  const unresolvedCount = members.filter(
    (member) => String(member.status).trim().toLowerCase() !== 'resolved'
  ).length;

  const sorted = [...members].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const primary = sorted.find((m) => !m.cluster_id) ?? sorted[0];
  const coords = primary?.latitude != null && primary?.longitude != null;

  return (
    <>
      <button
        type="button"
        className="cluster-drawer-backdrop"
        aria-label="Close cluster panel"
        onClick={onClose}
      />
      <aside className="cluster-drawer" role="dialog" aria-label="Cluster reports">
        <div className="cluster-drawer__header">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="cluster-report-badge">{reportCount}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-red-400">
                  Macro-Incident Cluster
                </span>
                {clusterSeverity && (
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${clusterSeverity.badgeClass}`}>
                    {clusterSeverity.label}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight">
                    {reportCount} Linked Reports
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Multiple citizens reported the same event within 100 meters. Review each
                    description below for scene details.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onResolveGroup?.(members)}
                  disabled={resolveLoading || unresolvedCount === 0}
                  className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors border border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unresolvedCount === 0
                    ? 'All Resolved'
                    : resolveLoading
                    ? 'Resolving...'
                    : `Resolve ${unresolvedCount}`}
                </button>
              </div>
              {coords && (
                <p className="text-[10px] text-zinc-600 font-mono mt-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {primary.latitude.toFixed(5)}, {primary.longitude.toFixed(5)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="cluster-accordion">
          {sorted.map((report, index) => (
            <AccordionReport
              key={report.id}
              report={report}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
