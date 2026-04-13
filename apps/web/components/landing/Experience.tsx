'use client';

import { useRef, useEffect, useState } from 'react';
import { Overlay } from './Overlay';

// ── Performance constants ─────────────────────────────────────────────────
// On desktop we can seek more often; on mobile each seek decodes a frame
// from scratch — extremely expensive. Seek far less on mobile.
const LERP_DESKTOP = 0.08;
const LERP_MOBILE  = 0.05;

// Minimum progress delta before we seek. Skipping sub-frame deltas avoids
// redundant GPU decode work (key on mobile).
// At 30fps over a 10s clip, one frame ≈ 0.0033 progress units.
const MIN_SEEK_DELTA = 0.004;

// ms of idle before we cancel the rAF loop entirely — zero GPU cost at rest.
const IDLE_TIMEOUT_MS = 250;

// Throttle React state updates to avoid layout thrash on every frame.
const TEXT_DELTA_DESKTOP = 0.0005;
const TEXT_DELTA_MOBILE  = 0.005;

export default function Experience() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const targetRef   = useRef(0);        // raw scroll target 0-1
  const currentRef  = useRef(0);        // lerped value
  const videoReady  = useRef(false);
  const rafId       = useRef<number | null>(null);
  const idleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekRef = useRef(-1);       // last value actually written to video
  const lastTextRef = useRef(0);        // last value pushed to React state
  const isMobile    = useRef(false);

  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    isMobile.current =
      typeof window !== 'undefined' &&
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const video = videoRef.current;
    if (!video) return;

    const LERP = isMobile.current ? LERP_MOBILE : LERP_DESKTOP;
    const TEXT_DELTA = isMobile.current ? TEXT_DELTA_MOBILE : TEXT_DELTA_DESKTOP;

    /* ── helpers ─────────────────────────────────────────── */
    const getScroll = (): number => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      return h > 0 ? Math.max(0, Math.min(1, window.scrollY / h)) : 0;
    };

    const applyTime = (progress: number) => {
      if (!videoReady.current) return;
      const d = video.duration;
      if (!d || !isFinite(d)) return;
      // Skip seek if delta is below one video frame — avoids redundant decoding
      if (Math.abs(progress - lastSeekRef.current) < MIN_SEEK_DELTA) return;
      video.currentTime = progress * d;
      lastSeekRef.current = progress;
    };

    /* ── keep video paused ───────────────────────────────── */
    const lockPaused = () => { if (!video.paused) video.pause(); };
    video.addEventListener('play',    lockPaused);
    video.addEventListener('playing', lockPaused);

    /* ── video ready ────────────────────────────────────── */
    const onReady = () => {
      lockPaused();
      if (videoReady.current) return;
      videoReady.current = true;
      const p = getScroll();
      targetRef.current = currentRef.current = lastSeekRef.current = p;
      applyTime(p);
      setDisplayProgress(p);
      lastTextRef.current = p;
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay',        onReady);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();

    /* ── rAF loop (only runs while scrolling) ───────────── */
    const loop = () => {
      const prev = currentRef.current;
      const next = prev + (targetRef.current - prev) * LERP;
      currentRef.current = next;

      applyTime(next);

      if (Math.abs(next - lastTextRef.current) > TEXT_DELTA) {
        lastTextRef.current = next;
        setDisplayProgress(next);
      }

      rafId.current = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(loop);
      }
    };

    const stopLoop = () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };

    /* ── scroll handler ─────────────────────────────────── */
    const onScroll = () => {
      targetRef.current = getScroll();
      startLoop();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stopLoop, IDLE_TIMEOUT_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    // Run one short loop on mount to render first frame, then stop
    startLoop();
    setTimeout(stopLoop, 600);

    return () => {
      stopLoop();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('scroll', onScroll);
      video.removeEventListener('play',           lockPaused);
      video.removeEventListener('playing',        lockPaused);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay',        onReady);
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
            // GPU compositing layer — avoids layout invalidation on seek
            transform: 'translateZ(0)',
            willChange: 'transform',
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
