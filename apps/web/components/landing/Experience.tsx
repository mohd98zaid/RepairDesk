'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';

gsap.registerPlugin(ScrollTrigger);

// ── Mobile config ─────────────────────────────────────────────────────────
// GSAP scrub value: higher = more smoothing lag (1.5 is cinematic on mobile)
const SCRUB_DESKTOP = 1;
const SCRUB_MOBILE  = 1.5;

// Throttle React text-overlay updates to avoid layout thrash
const TEXT_THRESHOLD_DESKTOP = 0.001;
const TEXT_THRESHOLD_MOBILE  = 0.006;

// Extracted from disassembly.mp4 (6.03s at 30fps)
const FRAME_COUNT = 181;

export default function Experience() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const proxyRef    = useRef({ progress: 0 });   // GSAP drives this object
  const lastFrameRef = useRef(-1);
  const lastTextRef = useRef(0);
  const isMobile    = useRef(false);
  const imagesRef   = useRef<HTMLImageElement[]>([]); // preloaded frames array

  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    isMobile.current =
      typeof window !== 'undefined' &&
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SCRUB       = isMobile.current ? SCRUB_MOBILE  : SCRUB_DESKTOP;
    const TEXT_THRESH = isMobile.current ? TEXT_THRESHOLD_MOBILE : TEXT_THRESHOLD_DESKTOP;

    // ── Preload Images ──────────────────────────────────────────────────
    // Load all 181 WebP frames into memory. Total size ~ 1.9MB.
    // They will be drawn instantly to the canvas.
    const images: HTMLImageElement[] = [];
    for (let i = 1; i <= FRAME_COUNT; i++) {
        const img = new window.Image();
        // Zero-pad to 3 digits (e.g. 001, 012, 181)
        const frameNum = i.toString().padStart(3, '0');
        img.src = `/frames/frame_${frameNum}.webp`;
        images.push(img);
    }
    imagesRef.current = images;

    // ── Draw Function ───────────────────────────────────────────────────
    const drawFrame = (index: number) => {
        if (index < 0 || index >= FRAME_COUNT) return;
        const img = imagesRef.current[index];
        
        // Ensure image is fully loaded and has valid dimensions before drawing
        if (img && img.complete && img.naturalWidth !== 0) {
            // Replicate CSS object-fit: cover
            const canvasRatio = canvas.width / canvas.height;
            const imgRatio = img.naturalWidth / img.naturalHeight;
            
            let renderWidth = canvas.width;
            let renderHeight = canvas.height;
            let renderX = 0;
            let renderY = 0;
            
            if (canvasRatio > imgRatio) {
                // Canvas is wider than image (landscape)
                renderHeight = canvas.width / imgRatio;
                renderY = (canvas.height - renderHeight) / 2;
            } else {
                // Canvas is taller than image (portrait, i.e. mobile)
                renderWidth = canvas.height * imgRatio;
                renderX = (canvas.width - renderWidth) / 2;
            }

            // Clear previous and draw next
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);
            lastFrameRef.current = index;
        }
    };

    // ── Size canvas to fill viewport ────────────────────────────────────
    const sizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Repaint current frame at new size
      if (lastFrameRef.current !== -1) {
        drawFrame(lastFrameRef.current);
      }
    };
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });

    // Ensure First Frame is drawn
    if (images[0].complete) {
        drawFrame(0);
    } else {
        images[0].addEventListener('load', () => drawFrame(0), { once: true });
    }

    // ── GSAP ticker callback ───────────────────────────────────────────
    const onTick = () => {
      const p = proxyRef.current.progress;

      // Map progress (0 to 1) to frame index (0 to 180)
      const targetFrameIndex = Math.round(p * (FRAME_COUNT - 1));

      // Draw if progress moved to a new frame
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

    // ── ScrollTrigger drives proxy.progress 0→1 ──────────────
    const trigger = ScrollTrigger.create({
      trigger : document.body,
      start   : 'top top',
      end     : 'bottom bottom',
      scrub   : SCRUB,
      onUpdate: (self) => {
        proxyRef.current.progress = self.progress;
      },
    });

    // normalizeScroll kills iOS rubber-band jank and Android overscroll jitter
    ScrollTrigger.normalizeScroll(true);

    // Initial state sync (handles page restores midway down)
    const initialProgress = ScrollTrigger.getAll()[0]?.progress ?? 0;
    proxyRef.current.progress = initialProgress;
    setDisplayProgress(initialProgress);

    return () => {
      gsap.ticker.remove(onTick);
      trigger.kill();
      ScrollTrigger.normalizeScroll(false);
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

        {/* ── Framewise Image Sequence Canvas ── */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            display: 'block',
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
