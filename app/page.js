"use client";

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Flame, 
  Shield, 
  HeartPulse, 
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Navigation
} from 'lucide-react';

export default function IncidentForm() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [state, setState] = useState('idle'); // 'idle' | 'locating' | 'sending' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [coords, setCoords] = useState(null);

  const handleReport = async (e) => {
    e.preventDefault();
    if (!selectedCategory) return;

    setState('locating');
    setErrorMessage('');
    setCoords(null);

    const finalDescription = customDescription.trim() || 'Quick SOS Triggered';

    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by this browser.');
      setState('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ latitude, longitude });
        setState('sending');

        try {
          // 1. Insert record into Supabase 'incidents' table
          const { data, error } = await supabase
            .from('incidents')
            .insert([
              {
                title: selectedCategory,
                description: finalDescription,
                latitude,
                longitude,
                status: 'i_ri',
                source: 'civilian',
              },
            ])
            .select();

          if (error) throw error;

          if (data?.length > 0) {
            const newId = data[0].id;
            fetch('/api/triage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                incidentId: newId,
                description: finalDescription,
              }),
            }).catch((triageError) => {
              console.error('AI triage dispatch failed:', triageError);
            });
            fetch('/api/cluster', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ incidentId: newId }),
            }).catch((clusterError) => {
              console.error('Incident clustering failed:', clusterError);
            });
          }

          setState('success');
          setSelectedCategory('');
          setCustomDescription('');
        } catch (err) {
          console.error(err);
          setErrorMessage(err.message || 'Failed to submit SOS.');
          setState('error');
        }
      },
      (error) => {
        console.error(error);
        setErrorMessage('Failed to capture GPS. Please enable location services.');
        setState('error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleReset = () => {
    setState('idle');
    setSelectedCategory('');
    setCustomDescription('');
    setErrorMessage('');
    setCoords(null);
  };

  // Render Loading/Locating States
  if (state === 'locating' || state === 'sending') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-6 text-center">
        <Loader2 className="w-16 h-16 text-red-500 animate-spin mb-8" />
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">
          {state === 'locating' ? 'Locating GPS...' : 'Sending Alert...'}
        </h1>
        <p className="text-zinc-500 text-sm uppercase tracking-wider font-semibold">
          {selectedCategory} Emergency
        </p>
        {coords && (
          <p className="font-mono text-zinc-600 mt-6 text-xs bg-zinc-900/60 px-3 py-1.5 rounded-lg border border-zinc-900">
            GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </p>
        )}
      </div>
    );
  }

  // Render Success State
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-6 text-center">
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-full mb-6">
          <CheckCircle className="w-16 h-16 text-emerald-400" />
        </div>
        <h1 className="text-3xl font-black text-emerald-400 tracking-tight mb-2">
          SOS TRANSMITTED
        </h1>
        <p className="text-zinc-300 text-base max-w-xs font-medium">
          Emergency signal sent. Help is being coordinated.
        </p>
        
        <button
          onClick={handleReset}
          className="mt-10 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal
        </button>
      </div>
    );
  }

  // Render Error State
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-full mb-6">
          <XCircle className="w-16 h-16 text-red-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-red-500 tracking-tight mb-2">
          TRANSMISSION FAILED
        </h1>
        <p className="text-zinc-400 text-sm max-w-xs mb-6">
          {errorMessage}
        </p>
        
        <button
          onClick={handleReset}
          className="bg-red-600 hover:bg-red-500 text-white px-8 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 active:scale-95 cursor-pointer shadow-lg shadow-red-600/15"
        >
          <ArrowLeft className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  // Render Mobile First Idle Form
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between font-sans selection:bg-red-500/20 selection:text-red-300">
      
      {/* Top Header */}
      <header className="py-4 border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-md mx-auto px-6 flex justify-between items-center">
          <div className="flex flex-col leading-none gap-0.5">
            <span className="text-xl font-black tracking-tight text-white">
              Atlas
            </span>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
              Citizen SOS
            </span>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/10">
            <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />
            GPS Enabled
          </span>
        </div>
      </header>

      {/* Main Content (Mobile First Sandbox) */}
      <main className="max-w-md w-full mx-auto px-6 py-8 flex-1 flex flex-col justify-center gap-6">
        
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">
            Emergency SOS
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Select a category, describe the situation, and submit.
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleReport} className="flex flex-col gap-6">
          
          {/* Step 1: Category Selector */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              1. Select Emergency Type
            </label>
            
            <div className="grid grid-cols-2 gap-3.5">
              
              {/* Medical */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Medical')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-95 ${
                  selectedCategory === 'Medical'
                    ? 'bg-red-500/10 border-red-500/60 text-red-400 shadow-md shadow-red-500/5'
                    : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                }`}
              >
                <HeartPulse className="w-7 h-7 mb-2 stroke-[1.5] text-red-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Medical</span>
              </button>

              {/* Fire */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Fire')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-95 ${
                  selectedCategory === 'Fire'
                    ? 'bg-orange-500/10 border-orange-500/60 text-orange-400 shadow-md shadow-orange-500/5'
                    : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                }`}
              >
                <Flame className="w-7 h-7 mb-2 stroke-[1.5] text-orange-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Fire</span>
              </button>

              {/* Police */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Police')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-95 ${
                  selectedCategory === 'Police'
                    ? 'bg-blue-500/10 border-blue-500/60 text-blue-400 shadow-md shadow-blue-500/5'
                    : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                }`}
              >
                <Shield className="w-7 h-7 mb-2 stroke-[1.5] text-blue-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Police</span>
              </button>

              {/* Natural Disaster */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Natural Disaster')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-95 ${
                  selectedCategory === 'Natural Disaster'
                    ? 'bg-amber-500/10 border-amber-500/60 text-amber-400 shadow-md shadow-amber-500/5'
                    : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                }`}
              >
                <AlertTriangle className="w-7 h-7 mb-2 stroke-[1.5] text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Rescue</span>
              </button>

            </div>
          </div>

          {/* Step 2: Description Text Area */}
          <div className="space-y-2.5">
            <label htmlFor="details" className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              2. Additional Details (Optional)
            </label>
            <textarea
              id="details"
              rows={4}
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="e.g. car crash on main street, active building fire..."
              className="w-full bg-zinc-900/30 border border-zinc-900 focus:border-red-500/40 text-white rounded-2xl px-4 py-3 text-sm transition-all duration-200 outline-none placeholder:text-zinc-600 resize-none font-sans"
            />
          </div>

          {/* Step 3: Main Submit Button */}
          <button
            type="submit"
            disabled={!selectedCategory}
            className={`w-full py-4 px-6 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              selectedCategory
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/40 active:scale-[0.98]'
                : 'bg-zinc-900 text-zinc-600 border border-zinc-900/50 cursor-not-allowed'
            }`}
          >
            <Navigation className="w-4 h-4 fill-current" />
            Send SOS Alert 🚨
          </button>

        </form>

      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-900 text-center text-[10px] text-zinc-600 bg-zinc-950/20">
        GPS is required on submit · source: civilian · status: i_ri
      </footer>
    </div>
  );
}
