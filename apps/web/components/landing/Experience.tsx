'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';

gsap.registerPlugin(ScrollTrigger);

// ── Scrub config ─────────────────────────────────────────────────────────
// Lenis provides the physics momentum (1.2s ease-out).
// A light scrub (0.15s desktop, 0.1s mobile) ensures the canvas frame
// tracks the smooth scroll momentum responsively without trailing lag.
const SCRUB_DESKTOP = 0.15;
const SCRUB_MOBILE  = 0.10;

// Throttle React text-overlay updates to avoid layout thrash
const TEXT_THRESHOLD_DESKTOP = 0.001;
const TEXT_THRESHOLD_MOBILE  = 0.005;

// Extracted from upscaled-video.mp4 (1080p full HD, 181 frames total)
const FRAME_COUNT = 181;

export default function Experience() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const proxyRef     = useRef({ progress: 0 }); // GSAP drives this object
  const lastFrameRef = useRef(-1);
  const lastTextRef  = useRef(0);
  const isMobile     = useRef(false);
  const imagesRef    = useRef<HTMLImageElement[]>([]); // preloaded frames array
  const isMounted    = useRef(false);

  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    isMounted.current = true;
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    isMobile.current = mobile;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false optimizes blit speed
    if (!ctx) return;

    const SCRUB       = mobile ? SCRUB_MOBILE : SCRUB_DESKTOP;
    const TEXT_THRESH = mobile ? TEXT_THRESHOLD_MOBILE : TEXT_THRESHOLD_DESKTOP;

    // ── Preload & Pre-decode 1080p WebP Frames ──────────────────────────
    const images: HTMLImageElement[] = [];
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new window.Image();
      const frameNum = i.toString().padStart(3, '0');
      img.src = `/frames/frame_${frameNum}.webp`;

      // Prioritize early frames for instant hero responsiveness
      if (i <= 20 && 'fetchPriority' in img) {
        (img as any).fetchPriority = 'high';
      }

      if ('decode' in img) {
        img.decode().catch(() => {});
      }
      images.push(img);
    }
    imagesRef.current = images;

    // ── Helper: Find Nearest Available Frame ───────────────────────────
    const getAvailableFrame = (index: number): HTMLImageElement | null => {
      const direct = images[index];
      if (direct && direct.complete && direct.naturalWidth !== 0) {
        return direct;
      }
      // Look for nearby loaded frame within +/- 20 frames to avoid stutter
      for (let offset = 1; offset <= 20; offset++) {
        const prev = images[index - offset];
        if (prev && prev.complete && prev.naturalWidth !== 0) return prev;
        const next = images[index + offset];
        if (next && next.complete && next.naturalWidth !== 0) return next;
      }
      return null;
    };

    // ── Draw Function (Cover sizing with Retina high-DPI scaling) ───────
    const drawFrame = (index: number) => {
      if (!isMounted.current) return;
      if (index < 0 || index >= FRAME_COUNT) return;

      const img = getAvailableFrame(index);
      if (img && img.complete && img.naturalWidth !== 0) {
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = img.naturalWidth / img.naturalHeight;

        let renderWidth = canvas.width;
        let renderHeight = canvas.height;
        let renderX = 0;
        let renderY = 0;

        if (canvasRatio > imgRatio) {
          renderHeight = canvas.width / imgRatio;
          renderY = (canvas.height - renderHeight) / 2;
        } else {
          renderWidth = canvas.height * imgRatio;
          renderX = (canvas.width - renderWidth) / 2;
        }

        ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);
        lastFrameRef.current = index;
      }
    };

    // ── Size canvas to fill viewport with device pixel ratio ───────────
    const sizeCanvas = () => {
      if (!isMounted.current || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);

      if (lastFrameRef.current !== -1) {
        drawFrame(lastFrameRef.current);
      } else if (imagesRef.current[0]?.complete) {
        drawFrame(0);
      }
    };
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });

    // Draw first frame once ready
    if (images[0].complete) {
      drawFrame(0);
    } else {
      images[0].addEventListener('load', () => drawFrame(0), { once: true });
    }

    // ── GSAP Ticker Callback ───────────────────────────────────────────
    const onTick = () => {
      if (!isMounted.current) return;
      const p = proxyRef.current.progress;

      // Map progress (0 to 1) to frame index (0 to 180)
      const targetFrameIndex = Math.min(
        FRAME_COUNT - 1,
        Math.max(0, Math.round(p * (FRAME_COUNT - 1)))
      );

      if (targetFrameIndex !== lastFrameRef.current) {
        drawFrame(targetFrameIndex);
      }

      // Throttle text overlay updates
      if (Math.abs(p - lastTextRef.current) > TEXT_THRESH) {
        lastTextRef.current = p;
        setDisplayProgress(p);
      }
    };
    gsap.ticker.add(onTick);

    // ── ScrollTrigger drives proxy.progress 0→1 ─────────────────────────
    const trigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: SCRUB,
      onUpdate: (self) => {
        if (!isMounted.current) return;
        proxyRef.current.progress = self.progress;
      },
    });

    // Initial state sync
    const initialProgress = ScrollTrigger.getAll()[0]?.progress ?? 0;
    proxyRef.current.progress = initialProgress;
    setDisplayProgress(initialProgress);

    return () => {
      isMounted.current = false;
      gsap.ticker.remove(onTick);
      trigger.kill();
      window.removeEventListener('resize', sizeCanvas);
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

        {/* ── 1080p Full HD Canvas Image Sequence ── */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />

        {/* Emerald accent bloom */}
        <div
          className="absolute inset-0 z-[5] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 45% 55% at 50% 50%, rgba(16,185,129,0.05) 0%, transparent 70%)' }}
        />
      </div>

      {/* ── Text Overlay & Storyline ── */}
      <div className="relative z-10">
        <Overlay scrollProgress={displayProgress} />
      </div>
    </div>
  );
}
