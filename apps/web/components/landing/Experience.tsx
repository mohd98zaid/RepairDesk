'use client';

import { useRef, useEffect, useState } from 'react';
import { Overlay } from './Overlay';

// Lerp factor — tune here:
//   0.06 = very cinematic / Apple-style slow
//   0.08 = smooth & responsive  ← default
//   0.12 = snappier
const LERP = 0.08;

export default function Experience() {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const targetRef      = useRef(0);   // raw scroll progress 0..1 (set on scroll)
  const currentRef     = useRef(0);   // lerped progress (driven by rAF)
  const videoReadyRef  = useRef(false);
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;

    /* ── helpers ─────────────────────────────────────────── */
    const getScroll = (): number => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      return h > 0 ? Math.max(0, Math.min(1, window.scrollY / h)) : 0;
    };

    const applyTime = (progress: number) => {
      if (!videoReadyRef.current) return;
      const d = video.duration;
      if (!d || !isFinite(d)) return;
      video.currentTime = progress * d;
    };

    /* ── keep video paused at all times ─────────────────── */
    const lockPaused = () => { if (!video.paused) video.pause(); };
    video.addEventListener('play',    lockPaused);
    video.addEventListener('playing', lockPaused);

    /* ── on video ready: snap lerp to current scroll (no lag) */
    const onReady = () => {
      lockPaused();
      if (!videoReadyRef.current) {
        videoReadyRef.current = true;
        const p = getScroll();
        targetRef.current  = p;
        currentRef.current = p; // snap — no lerp lag on first load
        applyTime(p);
      }
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay',        onReady);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();

    /* ── scroll: ONLY update target, never touch video here ─
       The rAF loop is the single driver of currentTime.
       This prevents janky double-sets & race conditions.    */
    const onScroll = () => { targetRef.current = getScroll(); };
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ── rAF loop: one lerp → drives both video + text ──── */
    const loop = () => {
      const prev = currentRef.current;
      const next = prev + (targetRef.current - prev) * LERP;
      currentRef.current = next;

      // Drive video
      applyTime(next);

      // Drive text overlay (React state — slightly throttled for perf)
      if (Math.abs(next - prev) > 0.0001) {
        setDisplayProgress(next);
      }

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('scroll', onScroll);
      video.removeEventListener('play',           lockPaused);
      video.removeEventListener('playing',        lockPaused);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay',        onReady);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="relative bg-black">

      {/* ── Fixed Video Background ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">

        {/* Radial vignette */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 25%, rgba(0,0,0,0.6) 100%)' }}
        />

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
          style={{ height: '30%', background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.85))' }}
        />

        {/* ── Disassembly video ── */}
        <video
          ref={videoRef}
          src="/disassembly.mp4"
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            willChange: 'contents',
          }}
        />

        {/* Emerald accent bloom */}
        <div
          className="absolute inset-0 z-[5] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 45% 55% at 50% 50%, rgba(16,185,129,0.05) 0%, transparent 70%)' }}
        />
      </div>

      {/* ── Overlay ── */}
      <div className="relative z-10">
        <Overlay scrollProgress={displayProgress} />
      </div>
    </div>
  );
}
