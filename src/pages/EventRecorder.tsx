import React, { useState, useEffect, useMemo } from 'react';
import type { EventRecord } from '../types';
import { IncidentReplay } from '../components/IncidentReplay';

export const EventRecorder: React.FC = () => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/events');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEvents(data);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Failed to fetch events", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      const matchesSearch =
        evt.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity =
        severityFilter === 'ALL' ||
        evt.severity?.toUpperCase() === severityFilter.toUpperCase();
      return matchesSearch && matchesSeverity;
    });
  }, [events, searchQuery, severityFilter]);

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-[25px] font-semibold tracking-tight leading-tight text-primary">Event recorder</h1>
          <p className="text-[14px] text-secondary mt-1">Automotive event log and incident telemetry analysis.</p>
        </div>
        <div className="text-xs font-mono text-muted">
          Events Logged: <span className="text-primary font-medium tabular-nums">{events.length}</span>
        </div>
      </div>

      {/* REPLAY PANEL IF AN EVENT IS SELECTED */}
      {selectedEventId && (
        <div className="rounded-[18px] glass-panel overflow-hidden">
          <IncidentReplay
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
          />
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="rounded-[18px] glass-panel p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-secondary font-medium">Filter:</span>
          <input
            type="text"
            placeholder="Search event type or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-white border border-border rounded-[9px] px-3.5 py-1.5 text-primary placeholder:text-muted outline-none focus:border-accent w-72 text-xs transition-colors shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-secondary font-medium">Severity:</span>
          <div className="flex items-center bg-surface-secondary border border-border rounded-[9px] p-0.5 text-xs font-mono">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded-[7px] transition-colors ${
                  severityFilter === sev
                    ? 'bg-white text-accent font-semibold shadow-xs'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* COMPACT EVENT TABLE */}
      <div className="rounded-[16px] glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/70 text-xs text-secondary font-medium">
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Event type</th>
                <th className="py-3 px-4 font-medium">Severity</th>
                <th className="py-3 px-4 font-medium">Description</th>
                <th className="py-3 px-4 font-medium">Source</th>
                <th className="py-3 px-4 font-medium">Recording</th>
                <th className="py-3 px-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs font-mono text-muted">
                    Loading incident event log...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-muted">
                    {events.length === 0 ? 'No events recorded.' : 'No matching events found.'}
                  </td>
                </tr>
              ) : (
                filteredEvents.map(evt => (
                  <tr
                    key={evt.id}
                    className={`hover:bg-surface-hover/80 transition-colors ${
                      selectedEventId === evt.id ? 'bg-surface-secondary/80' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono text-secondary tabular-nums">
                      {new Date(evt.detected_at).toLocaleString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4 text-primary font-medium">
                      {evt.event_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-full font-medium border ${
                          evt.severity === 'critical'
                            ? 'text-error border-error/30 bg-error-subtle'
                            : evt.severity === 'high'
                            ? 'text-warning border-warning/30 bg-warning-subtle'
                            : 'text-secondary border-border bg-surface-secondary'
                        }`}
                      >
                        {evt.severity || 'low'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-secondary max-w-sm truncate">
                      {evt.description}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-muted uppercase">
                      {evt.source_mode}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {evt.recording_id ? (
                        <span className="text-success font-medium">Attached</span>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEventId(evt.id)}
                        className="px-3 py-1.5 text-xs rounded-[9px] border border-border bg-white text-primary hover:bg-surface-hover transition-colors shadow-2xs font-medium"
                      >
                        {selectedEventId === evt.id ? 'Viewing' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
