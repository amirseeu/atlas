'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { X, MapPin, Navigation as NavigationIcon, Loader2, AlertCircle } from 'lucide-react';
import { getNearestStation } from '@/lib/emergencyStations';
import { getPublicEnv } from '@/lib/publicEnv';

function NavigationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [coordinates, setCoordinates] = useState({ from: null, to: null });
  const [station, setStation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    if (fromParam && toParam) {
      try {
        const [fromLat, fromLng] = fromParam.split(',').map(parseFloat);
        const [toLat, toLng] = toParam.split(',').map(parseFloat);
        
        if (!isNaN(fromLat) && !isNaN(fromLng) && !isNaN(toLat) && !isNaN(toLng)) {
          setCoordinates({
            from: { lat: fromLat, lng: fromLng },
            to: { lat: toLat, lng: toLng },
          });

          // Find the station closest to the 'from' coordinates
          const nearestStation = getNearestStation(fromLat, fromLng);
          setStation(nearestStation);
        }
      } catch (err) {
        console.error('Error parsing coordinates:', err);
      }
    }
    
    setLoading(false);
  }, [searchParams]);

  const handleClose = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!coordinates.from || !coordinates.to) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <MapPin className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-300">Invalid Route Parameters</h2>
          <p className="text-sm text-zinc-500 mt-2">Missing origin or destination coordinates.</p>
          <button
            onClick={handleClose}
            className="mt-6 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const apiKey = getPublicEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  
  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-300">Configuration Error</h2>
          <p className="text-sm text-zinc-500 mt-2">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local</p>
        </div>
      </div>
    );
  }

  const iframeUrl = `https://www.google.com/maps/embed/v1/directions?key=${apiKey}&origin=${coordinates.from.lat},${coordinates.from.lng}&destination=${coordinates.to.lat},${coordinates.to.lng}&mode=driving`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Navigation Header */}
      <div className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20 shrink-0">
              <NavigationIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-white leading-tight truncate">
                Emergency Dispatch Route
              </h1>
              {station && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-blue-400 leading-tight truncate">
                    {station.name}
                  </p>
                  {station.address && (
                    <p className="text-[10px] text-zinc-500 truncate">{station.address}</p>
                  )}
                  {station.phone && (
                    <p className="text-[10px] text-zinc-500 truncate">{station.phone}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-sm font-semibold text-zinc-300 hover:text-zinc-100 shrink-0"
            aria-label="Close navigation view"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Route Information Bar */}
      <div className="bg-zinc-900/40 border-b border-zinc-900 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="bg-green-500/10 p-2 rounded border border-green-500/20 mt-0.5 shrink-0">
                <MapPin className="h-3.5 w-3.5 text-green-400" />
              </div>
              <div className="min-w-0">
                <span className="block font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Departure Point</span>
                <span className="block text-zinc-300 font-mono text-[11px] truncate">
                  {coordinates.from.lat.toFixed(4)}, {coordinates.from.lng.toFixed(4)}
                </span>
                {station && (
                  <div>
                    <span className="block text-zinc-500 text-[10px] mt-1">{station.name}</span>
                    {station.address && (
                      <span className="block text-zinc-500 text-[10px] truncate">{station.address}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-red-500/10 p-2 rounded border border-red-500/20 mt-0.5 shrink-0">
                <MapPin className="h-3.5 w-3.5 text-red-400" />
              </div>
              <div className="min-w-0">
                <span className="block font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Emergency Destination</span>
                <span className="block text-zinc-300 font-mono text-[11px] truncate">
                  {coordinates.to.lat.toFixed(4)}, {coordinates.to.lng.toFixed(4)}
                </span>
                <span className="block text-zinc-500 text-[10px] mt-1">Incident Location</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Google Maps Embed Container */}
      <div className="flex-1 bg-zinc-950 p-4 sm:p-6 overflow-hidden">
        <div className="w-full h-full rounded-2xl border border-zinc-900 overflow-hidden shadow-2xl shadow-zinc-950/50 bg-zinc-900">
          <iframe
            width="100%"
            height="440px"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen=""
            referrerPolicy="no-referrer-when-downgrade"
            src={iframeUrl}
            title="Emergency Route Navigation"
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-zinc-900 bg-zinc-950/80 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs text-zinc-500 leading-relaxed">
            <strong className="text-zinc-300">Live Navigation Active.</strong> Follow the route displayed on the map. 
            If conditions change or obstacles are encountered, click <strong>Close</strong> to return to the dashboard for reassessment.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NavigationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
      </div>
    }>
      <NavigationContent />
    </Suspense>
  );
}
