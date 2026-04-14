'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';

gsap.registerPlugin(ScrollTrigger);

// ── Tuning constants ──────────────────────────────────────────────────────
const SCRUB_DESKTOP = 1;
const SCRUB_MOBILE  = 1.5;

// Only seek if progress changed by at least this much (≈1 video frame @ 30fps)
const MIN_SEEK_DELTA = 0.003;

// Only update React state when progress changes this much (avoid layout thrash)
const TEXT_THRESH_DESKTOP = 0.001;
const TEXT_THRESH_MOBILE  = 0.006;

export default function Experience() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const videoReady  = useRef(false);
  const lastSeekRef = useRef(-1);
  const lastTextRef = useRef(0);
  const isMobile    = useRef(false);

  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    isMobile.current = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const SCRUB      = isMobile.current ? SCRUB_MOBILE  : SCRUB_DESKTOP;
    const TEXT_THRESH = isMobile.current ? TEXT_THRESH_MOBILE : TEXT_THRESH_DESKTOP;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Size canvas to fill viewport ────────────────────────────────────
    const sizeCanvas = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });

    // ── Keep video paused (it's only a decoder, never plays) ────────────
    const lockPaused = () => { if (!video.paused) video.pause(); };
    video.addEventListener('play',    lockPaused);
    video.addEventListener('playing', lockPaused);

    // ── Draw frame to canvas ONLY after the seek has decoded ────────────
    // This is the core of the canvas technique: we don't display the video
    // element at all. Instead we paint each decoded frame onto a canvas.
    // The seeked event guarantees the frame is fully decoded before we draw —
    // eliminating the "stale frame" flicker that causes visible jank.
    const onSeeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    video.addEventListener('seeked', onSeeked);

    // ── Seek function — skips seeks smaller than one video frame ─────────
    const seek = (progress: number) => {
      if (!videoReady.current) return;
      const d = video.duration;
      if (!d || !isFinite(d)) return;
      if (Math.abs(progress - lastSeekRef.current) < MIN_SEEK_DELTA) return;
      video.currentTime = progress * d;
      lastSeekRef.current = progress;
    };

    // ── Video ready: snap to current scroll position ─────────────────────
    const onReady = () => {
      lockPaused();
      if (videoReady.current) return;
      videoReady.current = true;
      const snap = ScrollTrigger.getAll()[0]?.progress ?? 0;
      lastSeekRef.current = snap;
      lastTextRef.current = snap;
      video.currentTime = snap * (video.duration || 0);
      setDisplayProgress(snap);
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay',        onReady);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();

    // ── GSAP ticker: reads lerped progress and triggers seeks ────────────
    // GSAP's ticker is more precise than rAF and handles tab-visibility
    // changes and missed frames gracefully.
    const onTick = () => {
      const p = ScrollTrigger.getAll()[0]?.progress ?? 0;
      seek(p);
      if (Math.abs(p - lastTextRef.current) > TEXT_THRESH) {
        lastTextRef.current = p;
        setDisplayProgress(p);
      }
    };
    gsap.ticker.add(onTick);

    // ── ScrollTrigger lerps progress 0→1 via scrub ───────────────────────
    // scrub: N means the animation catches up over N seconds — this is
    // the built-in GSAP lerp. Higher values on mobile = more smoothing.
    const trigger = ScrollTrigger.create({
      trigger : document.body,
      start   : 'top top',
      end     : 'bottom bottom',
      scrub   : SCRUB,
    });

    // normalizeScroll kills iOS rubber-band jank and Android overscroll jitter
    ScrollTrigger.normalizeScroll(true);

    return () => {
      gsap.ticker.remove(onTick);
      trigger.kill();
      ScrollTrigger.normalizeScroll(false);
      window.removeEventListener('resize', sizeCanvas);
      video.removeEventListener('play',           lockPaused);
      video.removeEventListener('playing',        lockPaused);
      video.removeEventListener('seeked',         onSeeked);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay',        onReady);
    };
  }, []);

  return (
    <div className="relative bg-black">

      {/* ── Fixed Background ── */}
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

        {/*
          ── Canvas: the visible display surface ──
          Frames are painted here via ctx.drawImage() on every seeked event.
          This is >2x faster than displaying a <video> element directly
          on mobile, because the browser doesn't have to maintain a live
          video compositing layer on the GPU.
        */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            display: 'block',
          }}
        />

        {/*
          ── Video: hidden decoder only ──
          Never displayed; acts purely as a frame source for the canvas.
          Hidden via display:none to prevent any compositing cost.
        */}
        <video
          ref={videoRef}
          src="/disassembly.mp4"
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          style={{ display: 'none' }}
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
