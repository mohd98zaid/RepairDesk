'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Overlay } from './Overlay';
import dynamic from 'next/dynamic';
const Desktop3DSceneNoSSR = dynamic(() => import('./Desktop3DScene'), { ssr: false });

gsap.registerPlugin(ScrollTrigger);

// ── Mobile config ─────────────────────────────────────────────────────────
// GSAP scrub value: higher = more smoothing lag (1.5 is cinematic, 0.1 is instant 1:1)
const SCRUB_DESKTOP = 0.2;
const SCRUB_MOBILE  = 0.1;

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
  const [isClientMode, setIsClientMode] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    isMobile.current = mobile;
    setIsMobileDevice(mobile);
    setIsClientMode(true);

    const SCRUB       = mobile ? SCRUB_MOBILE  : SCRUB_DESKTOP;
    const TEXT_THRESH = mobile ? TEXT_THRESHOLD_MOBILE : TEXT_THRESHOLD_DESKTOP;

    // ── Prepare Canvas ONLY if Mobile ───────────────────────────────────
    let sizeCanvas = () => {};
    if (mobile && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            // Load frames
            const images: HTMLImageElement[] = [];
            for (let i = 1; i <= FRAME_COUNT; i++) {
                const img = new window.Image();
                const frameNum = i.toString().padStart(3, '0');
                img.src = `/frames/frame_${frameNum}.webp`;
                images.push(img);
            }
            imagesRef.current = images;

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

            sizeCanvas = () => {
              if (!isMounted.current) return;
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              if (lastFrameRef.current !== -1) {
                drawFrame(lastFrameRef.current);
              }
            };
            sizeCanvas();
            window.addEventListener('resize', sizeCanvas, { passive: true });

            if (images[0].complete) {
                drawFrame(0);
            } else {
                images[0].addEventListener('load', () => drawFrame(0), { once: true });
            }
        }
    }

    // ── GSAP ticker callback ───────────────────────────────────────────
    const onTick = () => {
      if (!isMounted.current) return;
      const p = proxyRef.current.progress;

      if (isMobile.current) {
          const targetFrameIndex = Math.round(p * (FRAME_COUNT - 1));
          if (targetFrameIndex !== lastFrameRef.current && imagesRef.current[targetFrameIndex]) {
              const index = targetFrameIndex;
              const canvas = canvasRef.current;
              const img = imagesRef.current[index];
              if (canvas && img && img.complete && img.naturalWidth !== 0) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
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
              }
          }
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
        if (!isMounted.current) return;
        proxyRef.current.progress = self.progress;
      },
    });

    // Only normalize on mobile/touch devices
    if (mobile) {
      ScrollTrigger.normalizeScroll(true);
    }

    const initialProgress = ScrollTrigger.getAll()[0]?.progress ?? 0;
    proxyRef.current.progress = initialProgress;
    setDisplayProgress(initialProgress);

     return () => {
       isMounted.current = false;
       gsap.ticker.remove(onTick);
       trigger.kill();
       ScrollTrigger.normalizeScroll(false);
       if (isMobile.current && typeof sizeCanvas === 'function') {
           window.removeEventListener('resize', sizeCanvas);
       }
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

        {/* ── Desktop R3F 3D Scene ── */}
      {/* Client-side 3D scene to avoid hydration mismatch */}
      <Desktop3DSceneNoSSR proxyRef={proxyRef} />

        {/* ── Framewise Image Sequence Canvas (Mobile) ── */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            display: isClientMode && isMobileDevice ? 'block' : 'none',
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
