'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';

gsap.registerPlugin(ScrollTrigger);

// ── Mobile config ─────────────────────────────────────────────────────────
// GSAP scrub value: higher = more smoothing lag (1.5 is cinematic on mobile)
const SCRUB_DESKTOP = 1;
const SCRUB_MOBILE  = 1.8;

// Minimum progress delta before seeking the video (avoids redundant decodes)
const MIN_SEEK_DELTA = 0.004;

// Throttle React text-overlay updates to avoid layout thrash
const TEXT_THRESHOLD_DESKTOP = 0.001;
const TEXT_THRESHOLD_MOBILE  = 0.006;

export default function Experience() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const proxyRef    = useRef({ progress: 0 });   // GSAP drives this object
  const videoReady  = useRef(false);
  const lastSeekRef = useRef(-1);
  const lastTextRef = useRef(0);
  const isMobile    = useRef(false);

  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    isMobile.current =
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const video = videoRef.current;
    if (!video) return;

    const SCRUB       = isMobile.current ? SCRUB_MOBILE  : SCRUB_DESKTOP;
    const TEXT_THRESH = isMobile.current ? TEXT_THRESHOLD_MOBILE : TEXT_THRESHOLD_DESKTOP;

    /* ── Keep video paused at all times ─────────────────────── */
    const lockPaused = () => { if (!video.paused) video.pause(); };
    video.addEventListener('play',    lockPaused);
    video.addEventListener('playing', lockPaused);

    /* ── Apply seek — skip sub-frame deltas ─────────────────── */
    const applyTime = (progress: number) => {
      if (!videoReady.current) return;
      const d = video.duration;
      if (!d || !isFinite(d)) return;
      if (Math.abs(progress - lastSeekRef.current) < MIN_SEEK_DELTA) return;
      video.currentTime = progress * d;
      lastSeekRef.current = progress;
    };

    /* ── GSAP ticker callback — called every GSAP frame ─────── */
    // This runs on GSAP's optimised internal ticker, NOT rAF directly.
    // It reads the proxy.progress that ScrollTrigger lerps automatically.
    const onTick = () => {
      const p = proxyRef.current.progress;

      applyTime(p);

      if (Math.abs(p - lastTextRef.current) > TEXT_THRESH) {
        lastTextRef.current = p;
        setDisplayProgress(p);
      }
    };
    gsap.ticker.add(onTick);

    /* ── ScrollTrigger drives proxy.progress 0→1 ────────────── */
    const trigger = ScrollTrigger.create({
      trigger : document.body,
      start   : 'top top',
      end     : 'bottom bottom',
      scrub   : SCRUB,          // GSAP's built-in lerp — much smoother on mobile
      onUpdate: (self) => {
        proxyRef.current.progress = self.progress;
      },
    });

    /* ── normalizeScroll: tames iOS rubber-band & Android jank ─ */
    // Must be called after ScrollTrigger.create()
    ScrollTrigger.normalizeScroll(true);

    /* ── Video ready: snap to current scroll position ─────────  */
    const onReady = () => {
      lockPaused();
      if (videoReady.current) return;
      videoReady.current = true;
      const p = ScrollTrigger.getAll()[0]?.progress ?? 0;
      proxyRef.current.progress  = p;
      lastSeekRef.current        = p;
      lastTextRef.current        = p;
      applyTime(p);
      setDisplayProgress(p);
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay',        onReady);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();

    return () => {
      gsap.ticker.remove(onTick);
      trigger.kill();
      ScrollTrigger.normalizeScroll(false);
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
