'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';

gsap.registerPlugin(ScrollTrigger);

// ── Scrub config ─────────────────────────────────────────────────────────
// GSAP scrub value: 0.4 provides smooth buttery deceleration on desktop
const SCRUB_DESKTOP = 0.4;
const SCRUB_MOBILE  = 0.15;

// Throttle React text-overlay updates to avoid layout thrash
const TEXT_THRESHOLD_DESKTOP = 0.001;
const TEXT_THRESHOLD_MOBILE  = 0.006;

// Extracted from disassembly.mp4 (6.03s at 30fps)
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SCRUB       = mobile ? SCRUB_MOBILE : SCRUB_DESKTOP;
    const TEXT_THRESH = mobile ? TEXT_THRESHOLD_MOBILE : TEXT_THRESHOLD_DESKTOP;

    // ── Preload & Pre-decode Images ─────────────────────────────────────
    const images: HTMLImageElement[] = [];
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new window.Image();
      const frameNum = i.toString().padStart(3, '0');
      img.src = `/frames/frame_${frameNum}.webp`;
      if ('decode' in img) {
        img.decode().catch(() => {});
      }
      images.push(img);
    }
    imagesRef.current = images;

    // ── Draw Function (Cover sizing) ────────────────────────────────────
    const drawFrame = (index: number) => {
      if (!isMounted.current) return;
      if (index < 0 || index >= FRAME_COUNT) return;
      const img = imagesRef.current[index];

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

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);
        lastFrameRef.current = index;
      }
    };

    // ── Size canvas to fill viewport ────────────────────────────────────
    const sizeCanvas = () => {
      if (!isMounted.current || !canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
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
      const targetFrameIndex = Math.round(p * (FRAME_COUNT - 1));

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

    // Normalize scroll only on mobile devices to prevent URL bar jump
    if (mobile) {
      ScrollTrigger.normalizeScroll(true);
    }

    // Initial state sync
    const initialProgress = ScrollTrigger.getAll()[0]?.progress ?? 0;
    proxyRef.current.progress = initialProgress;
    setDisplayProgress(initialProgress);

    return () => {
      isMounted.current = false;
      gsap.ticker.remove(onTick);
      trigger.kill();
      if (mobile) {
        ScrollTrigger.normalizeScroll(false);
      }
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

        {/* ── Framewise Image Sequence Canvas (Universal Desktop & Mobile) ── */}
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
