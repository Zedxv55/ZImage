import { useEffect, useRef } from 'react';

interface HanumanEmblemCanvasProps {
  theme: 'light' | 'dark';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
}

export function HanumanEmblemCanvas({ theme }: HanumanEmblemCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let width = 480;
    let height = 380;

    const particles: Particle[] = Array.from({ length: 24 }, (_, idx) => ({
      x: ((idx * 73) % 100) / 100,
      y: ((idx * 41) % 100) / 100,
      vx: 0.00035 + (idx % 5) * 0.00012,
      vy: -0.00018 + (idx % 3) * 0.0001,
      r: 1.1 + (idx % 3) * 0.65,
      alpha: 0.25 + (idx % 4) * 0.14,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, Math.round(rect.width || 480));
      height = Math.max(280, Math.round(rect.height || 380));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    let phase = 0;

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      // Background subtle atmosphere gradient
      const bgGrad = ctx.createRadialGradient(
        width * 0.52,
        height * 0.45,
        24,
        width * 0.5,
        height * 0.5,
        width * 0.72
      );
      if (theme === 'dark') {
        bgGrad.addColorStop(0, 'rgba(37, 99, 235, 0.24)');
        bgGrad.addColorStop(0.55, 'rgba(11, 31, 58, 0.85)');
        bgGrad.addColorStop(1, 'rgba(16, 24, 32, 0.96)');
      } else {
        bgGrad.addColorStop(0, 'rgba(96, 165, 250, 0.22)');
        bgGrad.addColorStop(0.58, 'rgba(238, 243, 250, 0.88)');
        bgGrad.addColorStop(1, 'rgba(247, 249, 252, 0.98)');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Flowing stormwave crest bands behind emblem
      for (let band = 0; band < 4; band++) {
        const yBase = height * (0.58 + band * 0.09);
        const amp = 10 + band * 3.5;
        const speed = 1 + band * 0.22;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 12) {
          const y =
            yBase +
            Math.sin((x / width) * Math.PI * 3.1 + phase * speed + band * 1.1) * amp +
            Math.cos((x / width) * Math.PI * 1.6 - phase * 0.6) * (amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();

        if (theme === 'dark') {
          const alphas = [0.16, 0.22, 0.28, 0.36];
          ctx.fillStyle = `rgba(37, 99, 235, ${alphas[band]})`;
        } else {
          const alphas = [0.08, 0.11, 0.15, 0.2];
          ctx.fillStyle = `rgba(37, 99, 235, ${alphas[band]})`;
        }
        ctx.fill();

        // Crisp crest highlight line
        ctx.beginPath();
        for (let x = 0; x <= width; x += 12) {
          const y =
            yBase +
            Math.sin((x / width) * Math.PI * 3.1 + phase * speed + band * 1.1) * amp +
            Math.cos((x / width) * Math.PI * 1.6 - phase * 0.6) * (amp * 0.4);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle =
          theme === 'dark' ? 'rgba(96, 165, 250, 0.42)' : 'rgba(37, 99, 235, 0.28)';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // Drifting subtle ambient wind particles
      for (const p of particles) {
        if (!prefersReduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x > 1.04) p.x = -0.04;
          if (p.y < -0.04) p.y = 1.04;
          if (p.y > 1.04) p.y = -0.04;
        }
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
        ctx.fillStyle =
          theme === 'dark'
            ? `rgba(147, 197, 253, ${p.alpha})`
            : `rgba(37, 99, 235, ${p.alpha * 0.75})`;
        ctx.fill();
      }

      if (!prefersReduced) {
        phase += 0.022;
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [theme]);

  return (
    <div
      data-testid="hanuman-stormwave-stage"
      className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-[340px] sm:h-[390px] w-full"
      />

      {/* Original Hanuman Warrior Emblem SVG Overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
        <div className="relative flex flex-col items-center">
          <svg
            viewBox="0 0 260 260"
            className="h-52 w-52 sm:h-60 sm:w-60 drop-shadow-[0_14px_28px_rgba(11,31,58,0.28)]"
            role="img"
            aria-label="Hanuman Warrior Emblem"
          >
            <defs>
              <linearGradient id="hanumanShield" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0B1F3A" />
                <stop offset="55%" stopColor="#1E3A8A" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
              <linearGradient id="hanumanCrest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93C5FD" />
                <stop offset="50%" stopColor="#F8FAFC" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
              <linearGradient id="hanumanGoldTrim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>

            {/* Outer stormwave ring */}
            <circle
              cx="130"
              cy="130"
              r="116"
              fill="url(#hanumanShield)"
              stroke="url(#hanumanCrest)"
              strokeWidth="2.5"
            />
            <circle
              cx="130"
              cy="130"
              r="104"
              fill="none"
              stroke="rgba(96, 165, 250, 0.38)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* Wind crescent swooshes */}
            <path
              d="M42 152 C68 188, 128 206, 196 174 C166 196, 102 204, 48 168 Z"
              fill="#60A5FA"
              opacity="0.72"
            />
            <path
              d="M58 92 C78 60, 128 46, 184 64 C144 58, 92 70, 64 104 Z"
              fill="#93C5FD"
              opacity="0.55"
            />

            {/* Hanuman Royal Spire Crown (Chada) */}
            <path
              d="M130 28 L142 66 L154 78 L106 78 L118 66 Z"
              fill="url(#hanumanGoldTrim)"
              stroke="#F8FAFC"
              strokeWidth="1.4"
            />
            <path
              d="M100 84 L160 84 L154 98 L106 98 Z"
              fill="url(#hanumanCrest)"
            />

            {/* Hanuman Geometric Warrior Mask & Ear Scrolls (Kanok) */}
            <path
              d="M84 102 C72 104, 66 118, 76 132 C70 120, 76 110, 88 108 Z"
              fill="url(#hanumanGoldTrim)"
            />
            <path
              d="M176 102 C188 104, 194 118, 184 132 C190 120, 184 110, 172 108 Z"
              fill="url(#hanumanGoldTrim)"
            />

            {/* Main Warrior Face Silhouette */}
            <path
              d="M90 100 L170 100 L174 138 C174 166, 152 184, 130 188 C108 184, 86 166, 86 138 Z"
              fill="#F8FAFC"
              stroke="#0B1F3A"
              strokeWidth="2"
            />
            {/* Brow crest */}
            <path
              d="M94 104 L130 116 L166 104 L162 118 L130 126 L98 118 Z"
              fill="#1E3A8A"
            />
            {/* Focused eyes */}
            <path d="M102 126 L122 132 L106 136 Z" fill="#0B1F3A" />
            <path d="M158 126 L138 132 L154 136 Z" fill="#0B1F3A" />
            {/* Cheek armor curves */}
            <path
              d="M92 142 C106 146, 114 158, 118 172 L98 164 Z"
              fill="#2563EB"
              opacity="0.24"
            />
            <path
              d="M168 142 C154 146, 146 158, 142 172 L162 164 Z"
              fill="#2563EB"
              opacity="0.24"
            />
            {/* Royal jaw & mouth detail */}
            <path
              d="M114 156 L130 150 L146 156 L138 168 L130 164 L122 168 Z"
              fill="#0B1F3A"
            />

            {/* Crossed Trident Staff Accent */}
            <path
              d="M196 62 L196 196"
              stroke="url(#hanumanGoldTrim)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M186 78 C186 64, 196 54, 196 46 C196 54, 206 64, 206 78"
              fill="none"
              stroke="url(#hanumanGoldTrim)"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="mt-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-[#101820]/85 px-4 py-2 text-center backdrop-blur-xs">
          <p className="font-display text-sm font-semibold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            ZImage Creative Studio
          </p>
          <p className="text-xs text-[#64748B] dark:text-slate-300">
            AI Image · Layer Decomposition · Pro Editor · Multi-Track Video
          </p>
        </div>
      </div>
    </div>
  );
}
