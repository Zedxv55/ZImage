import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Film,
  Flag,
  Image as ImageIcon,
  Magnet,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Trash2,
  Type as TypeIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DEFAULT_VIDEO_CLIP_EFFECTS,
  formatTimecode,
  interpolateClipTransformAtTime,
  rippleDeleteClip,
  splitClipAtTime,
  trimClipBounds,
} from '../utils/videoTimelineLogic';
import type {
  TimelineClip,
  TimelineMarker,
  VideoTrack,
  VideoTrackKind,
  VideoTransitionType,
} from '../utils/videoTimelineLogic';
import {
  exportTimelineVideoWithAudio,
  extractAudioWaveformPeaks,
} from '../utils/audioVideoMuxer';
import { triggerBlobDownload } from '../utils/canvasImageHelper';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';

interface MediaBinAsset {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  url: string;
  durationSec: number;
  waveformPeaks?: number[];
}

const INITIAL_TRACKS: VideoTrack[] = [
  { id: 'tr-video', name: 'V1 · Video / Image', kind: 'video', muted: false, solo: false, locked: false, hidden: false },
  { id: 'tr-overlay', name: 'V2 · Overlay / Logo', kind: 'overlay', muted: false, solo: false, locked: false, hidden: false },
  { id: 'tr-text', name: 'T1 · Title / Subtitle', kind: 'text', muted: false, solo: false, locked: false, hidden: false },
  { id: 'tr-audio', name: 'A1 · Audio / BGM', kind: 'audio', muted: false, solo: false, locked: false, hidden: false },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function VideoEditorView() {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const programCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const [mediaBin, setMediaBin] = useState<MediaBinAsset[]>(() =>
    CURATED_SHOWCASE_ITEMS.slice(0, 4).map((item, idx) => ({
      id: `seed-media-${idx}`,
      name: item.category,
      kind: 'image',
      url: item.imageUrl,
      durationSec: 4,
    }))
  );

  const [tracks, setTracks] = useState<VideoTrack[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>(() => [
    {
      id: 'clip-intro-img',
      trackId: 'tr-video',
      kind: 'image',
      name: CURATED_SHOWCASE_ITEMS[0].category,
      sourceUrl: CURATED_SHOWCASE_ITEMS[0].imageUrl,
      mediaDurationSec: 4,
      startSec: 0,
      durationSec: 4,
      inPointSec: 0,
      speed: 1,
      volume: 100,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      transitionIn: 'crossfade',
      transitionDurationSec: 0.6,
      effects: { ...DEFAULT_VIDEO_CLIP_EFFECTS },
      keyframes: [
        { id: 'kf-1', timeOffsetSec: 0, xPct: 50, yPct: 50, scale: 1, rotationDeg: 0, opacity: 100, easing: 'ease-out' },
        { id: 'kf-2', timeOffsetSec: 4, xPct: 50, yPct: 50, scale: 1.08, rotationDeg: 0, opacity: 100, easing: 'ease-out' },
      ],
    },
    {
      id: 'clip-intro-text',
      trackId: 'tr-text',
      kind: 'text',
      name: 'Title Intro',
      sourceUrl: '',
      mediaDurationSec: 3.5,
      startSec: 0.4,
      durationSec: 3.2,
      inPointSec: 0,
      speed: 1,
      volume: 100,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      transitionIn: 'crossfade',
      transitionDurationSec: 0.4,
      textContent: 'ZImage Creative Studio',
      textColor: '#FFFFFF',
      textFontSize: 56,
      effects: { ...DEFAULT_VIDEO_CLIP_EFFECTS },
      keyframes: [
        { id: 'tkf-1', timeOffsetSec: 0, xPct: 50, yPct: 80, scale: 1, rotationDeg: 0, opacity: 0, easing: 'ease-out' },
        { id: 'tkf-2', timeOffsetSec: 0.5, xPct: 50, yPct: 78, scale: 1, rotationDeg: 0, opacity: 100, easing: 'ease-out' },
      ],
    },
  ]);

  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-intro-img');
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [pxPerSec, setPxPerSec] = useState<number>(56);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canvasDim = useMemo(() => {
    if (aspect === '9:16') return { w: 720, h: 1280 };
    if (aspect === '1:1') return { w: 1080, h: 1080 };
    return { w: 1280, h: 720 };
  }, [aspect]);

  const totalDurationSec = useMemo(() => {
    const maxEnd = clips.reduce((acc, c) => Math.max(acc, c.startSec + c.durationSec), 8);
    return Math.max(6, Math.ceil(maxEnd));
  }, [clips]);

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) || null,
    [clips, selectedClipId]
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayheadSec((prev) => {
        const next = prev + dt;
        if (next >= totalDurationSec) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDurationSec]);

  // Program Canvas Preview Render
  useEffect(() => {
    const canvas = programCanvasRef.current;
    if (!canvas) return;
    canvas.width = canvasDim.w;
    canvas.height = canvasDim.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const render = async () => {
      ctx.fillStyle = '#081224';
      ctx.fillRect(0, 0, canvasDim.w, canvasDim.h);

      const active = clips.filter((c) => {
        const tr = trackMap.get(c.trackId);
        if (!tr || tr.hidden) return false;
        return c.kind !== 'audio' && playheadSec >= c.startSec && playheadSec <= c.startSec + c.durationSec;
      });

      for (const clip of active) {
        const tf = interpolateClipTransformAtTime(clip, playheadSec);
        const localT = playheadSec - clip.startSec;
        let alpha = tf.opacity / 100;
        if (clip.transitionIn === 'crossfade' && clip.transitionDurationSec > 0 && localT < clip.transitionDurationSec) {
          alpha *= Math.max(0, localT / clip.transitionDurationSec);
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate((tf.xPct / 100) * canvasDim.w, (tf.yPct / 100) * canvasDim.h);
        ctx.rotate((tf.rotationDeg * Math.PI) / 180);
        ctx.scale(tf.scale, tf.scale);

        ctx.filter = `brightness(${100 + clip.effects.exposure}%) contrast(${100 + clip.effects.contrast}%) saturate(${100 + clip.effects.saturation}%) blur(${clip.effects.blur}px)`;

        if (clip.kind === 'text') {
          ctx.font = `700 ${clip.textFontSize || 54}px "Prompt", "Noto Sans Thai", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = clip.textColor || '#FFFFFF';
          ctx.fillText(clip.textContent || clip.name, 0, 0);
        } else if (clip.kind === 'image' || clip.kind === 'overlay') {
          let img = imgCacheRef.current.get(clip.sourceUrl);
          if (!img && clip.sourceUrl) {
            img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const im = new Image();
              if (!clip.sourceUrl.startsWith('data:') && !clip.sourceUrl.startsWith('blob:')) {
                im.crossOrigin = 'anonymous';
              }
              im.onload = () => resolve(im);
              im.onerror = reject;
              im.src = clip.sourceUrl;
            }).catch(() => undefined);
            if (img) imgCacheRef.current.set(clip.sourceUrl, img);
          }
          if (img) {
            const asp = img.naturalWidth / Math.max(1, img.naturalHeight);
            let dw = canvasDim.w;
            let dh = canvasDim.w / asp;
            if (dh > canvasDim.h) {
              dh = canvasDim.h;
              dw = canvasDim.h * asp;
            }
            if (clip.kind === 'overlay') {
              dw *= 0.42;
              dh *= 0.42;
            }
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          }
        } else if (clip.kind === 'video') {
          let vid = videoCacheRef.current.get(clip.sourceUrl);
          if (!vid && clip.sourceUrl) {
            vid = document.createElement('video');
            vid.muted = true;
            vid.playsInline = true;
            vid.src = clip.sourceUrl;
            videoCacheRef.current.set(clip.sourceUrl, vid);
          }
          if (vid && vid.readyState >= 2) {
            const vt = Math.min(vid.duration || 10, clip.inPointSec + localT * clip.speed);
            if (Math.abs(vid.currentTime - vt) > 0.12) vid.currentTime = vt;
            const scaleFit = Math.min(
              canvasDim.w / Math.max(1, vid.videoWidth),
              canvasDim.h / Math.max(1, vid.videoHeight)
            );
            const dw = vid.videoWidth * scaleFit;
            const dh = vid.videoHeight * scaleFit;
            ctx.drawImage(vid, -dw / 2, -dh / 2, dw, dh);
          }
        }
        ctx.restore();
      }
    };
    render();
  }, [clips, tracks, playheadSec, canvasDim]);

  const handleUploadMediaFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('audio/')) {
        let durationSec = 10;
        let waveformPeaks: number[] = [];
        try {
          const wf = await extractAudioWaveformPeaks(url, 48);
          durationSec = Math.max(2, wf.durationSec);
          waveformPeaks = wf.peaks;
        } catch {
          // Keep default duration
        }
        setMediaBin((prev) => [
          { id: makeId('aud'), name: file.name, kind: 'audio', url, durationSec, waveformPeaks },
          ...prev,
        ]);
      } else if (file.type.startsWith('video/')) {
        setMediaBin((prev) => [
          { id: makeId('vid'), name: file.name, kind: 'video', url, durationSec: 6 },
          ...prev,
        ]);
      } else if (file.type.startsWith('image/')) {
        setMediaBin((prev) => [
          { id: makeId('img'), name: file.name, kind: 'image', url, durationSec: 4 },
          ...prev,
        ]);
      }
    }
    e.target.value = '';
  };

  const handleAddMediaToTimeline = (asset: MediaBinAsset, targetKind?: VideoTrackKind) => {
    const kind: VideoTrackKind = targetKind || (asset.kind === 'audio' ? 'audio' : asset.kind);
    const track = tracks.find((t) =>
      kind === 'audio' ? t.kind === 'audio' : kind === 'overlay' ? t.kind === 'overlay' : t.kind === 'video'
    ) || tracks[0];

    const trackClips = clips.filter((c) => c.trackId === track.id);
    const endOfTrack = trackClips.reduce((acc, c) => Math.max(acc, c.startSec + c.durationSec), 0);
    const startSec = snapEnabled ? Math.round(endOfTrack * 2) / 2 : Number(endOfTrack.toFixed(2));

    const newClip: TimelineClip = {
      id: makeId('clip'),
      trackId: track.id,
      kind,
      name: asset.name,
      sourceUrl: asset.url,
      mediaDurationSec: asset.durationSec,
      startSec,
      durationSec: Math.min(8, asset.durationSec),
      inPointSec: 0,
      speed: 1,
      volume: 100,
      fadeInSec: kind === 'audio' ? 0.5 : 0,
      fadeOutSec: kind === 'audio' ? 0.5 : 0,
      muted: false,
      transitionIn: 'crossfade',
      transitionDurationSec: 0.4,
      effects: { ...DEFAULT_VIDEO_CLIP_EFFECTS },
      keyframes: [],
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  };

  const handleAddTextClip = () => {
    const newClip: TimelineClip = {
      id: makeId('txt'),
      trackId: 'tr-text',
      kind: 'text',
      name: 'ข้อความใหม่',
      sourceUrl: '',
      mediaDurationSec: 4,
      startSec: Number(playheadSec.toFixed(2)),
      durationSec: 3.5,
      inPointSec: 0,
      speed: 1,
      volume: 100,
      fadeInSec: 0,
      fadeOutSec: 0,
      muted: false,
      transitionIn: 'crossfade',
      transitionDurationSec: 0.3,
      textContent: 'หัวข้อสร้างสรรค์ ZImage',
      textColor: '#FFFFFF',
      textFontSize: 54,
      effects: { ...DEFAULT_VIDEO_CLIP_EFFECTS },
      keyframes: [],
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  };

  const updateSelectedClip = (patch: Partial<TimelineClip>) => {
    if (!selectedClip) return;
    setClips((prev) => prev.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)));
  };

  const handleExportVideo = async () => {
    if (clips.length === 0) return;
    setExportBusy(true);
    setExportProgress(0);
    setIsPlaying(false);
    setNotice(null);
    try {
      const res = await exportTimelineVideoWithAudio({
        width: canvasDim.w,
        height: canvasDim.h,
        fps: 30,
        durationSec: totalDurationSec,
        tracks,
        clips,
        preferMp4: true,
        onProgress: setExportProgress,
      });
      triggerBlobDownload(res.blob, `zimage-timeline-${Date.now()}.${res.extension}`);
      setNotice(`ส่งออกวิดีโอพร้อมเสียง (.${res.extension.toUpperCase()}) สำเร็จแล้ว`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'ส่งออกวิดีโอไม่สำเร็จ');
    } finally {
      setExportBusy(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 space-y-4">
      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        onChange={handleUploadMediaFiles}
        className="hidden"
      />

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-4 py-3">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-5 w-5 text-[#2563EB] dark:text-[#60A5FA]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#101820] dark:text-[#F8FAFC]">
              Pro Multi-Track Video Editor
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              ไทม์ไลน์หลายแทร็ก วิดีโอ ภาพ ข้อความ และเสียง MP3/WAV พร้อมส่งออก WebM/MP4
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="สัดส่วนวิดีโอ"
            value={aspect}
            onChange={(e) => setAspect(e.target.value as '16:9' | '9:16' | '1:1')}
            className="min-h-[38px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 text-xs font-medium"
          >
            <option value="16:9">16:9 (1280×720)</option>
            <option value="9:16">9:16 Reels (720×1280)</option>
            <option value="1:1">1:1 Square (1080×1080)</option>
          </select>

          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 text-xs font-medium hover:border-[#2563EB] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
            <span>นำเข้าวิดีโอ / ภาพ / เสียง</span>
          </button>

          <button
            type="button"
            disabled={exportBusy}
            onClick={handleExportVideo}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              {exportBusy
                ? `กำลังเรนเดอร์ ${exportProgress ?? 0}%`
                : 'ส่งออกวิดีโอ (MP4/WebM)'}
            </span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#2563EB]/30 bg-[#EEF3FA] dark:bg-[#162947] px-4 py-2.5 text-xs text-[#101820] dark:text-[#F8FAFC]">
          {notice}
        </div>
      )}

      {/* Upper Studio Row: Media Bin | Program Monitor | Clip Inspector */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr_310px] lg:items-start">
        {/* Media Bin */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">คลังสื่อ (Media Bin)</h2>
            <button
              type="button"
              onClick={handleAddTextClip}
              className="inline-flex items-center gap-1 rounded-lg bg-[#EEF3FA] dark:bg-[#162947] px-2 py-1 text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer"
            >
              <TypeIcon className="h-3 w-3" />
              <span>+ ข้อความ</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
            {mediaBin.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {asset.kind === 'audio' ? (
                    <Music className="h-4 w-4 shrink-0 text-[#2563EB]" />
                  ) : asset.kind === 'video' ? (
                    <Film className="h-4 w-4 shrink-0 text-[#2563EB]" />
                  ) : (
                    <ImageIcon className="h-4 w-4 shrink-0 text-[#2563EB]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{asset.name}</p>
                    <p className="font-mono-tabular text-[10px] text-[#64748B] dark:text-slate-400">
                      {asset.kind} · {asset.durationSec}s
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddMediaToTimeline(asset)}
                  className="rounded-lg bg-[#2563EB] px-2 py-1 text-[11px] font-semibold text-white cursor-pointer shrink-0"
                >
                  + ใส่
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Program Monitor */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Program Monitor</span>
            <span className="font-mono-tabular text-[#2563EB] dark:text-[#60A5FA] font-semibold">
              {formatTimecode(playheadSec)} / {formatTimecode(totalDurationSec)}
            </span>
          </div>

          <div className="flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#081224] p-2">
            <canvas
              ref={programCanvasRef}
              className="max-h-[300px] max-w-full rounded object-contain"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPlaying((v) => !v)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-xs font-semibold text-white cursor-pointer"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isPlaying ? 'หยุด' : 'เล่น'}</span>
              </button>

              <button
                type="button"
                disabled={!selectedClip}
                onClick={() => {
                  if (!selectedClip) return;
                  setClips((prev) => splitClipAtTime(prev, selectedClip.id, playheadSec));
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2.5 text-xs font-medium cursor-pointer disabled:opacity-40"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>Split</span>
              </button>

              <button
                type="button"
                disabled={!selectedClip}
                onClick={() => {
                  if (!selectedClip) return;
                  setClips((prev) => rippleDeleteClip(prev, selectedClip.id));
                  setSelectedClipId(null);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/50 px-2.5 text-xs font-medium text-red-600 dark:text-red-300 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Ripple Delete</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setMarkers((prev) => [
                    ...prev,
                    { id: makeId('mk'), timeSec: Number(playheadSec.toFixed(1)), label: `M${prev.length + 1}` },
                  ])
                }
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2.5 text-xs font-medium cursor-pointer"
              >
                <Flag className="h-3.5 w-3.5 text-[#2563EB]" />
                <span>Marker</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSnapEnabled((v) => !v)}
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2 text-xs cursor-pointer ${
                  snapEnabled ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-[#E2E8F0] dark:border-slate-700'
                }`}
              >
                <Magnet className="h-3.5 w-3.5" />
                <span>Snap</span>
              </button>
              <label className="inline-flex items-center gap-1 text-[11px] text-[#64748B] dark:text-slate-400">
                <span>Zoom</span>
                <input
                  type="range"
                  min={28}
                  max={120}
                  value={pxPerSec}
                  onChange={(e) => setPxPerSec(Number(e.target.value))}
                  className="w-20 accent-[#2563EB]"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Clip Effects & Audio Inspector */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-3.5 space-y-3 text-xs">
          <h2 className="font-display text-sm font-semibold">ปรับแต่งคลิป (Clip Inspector)</h2>
          {selectedClip ? (
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-[#64748B] dark:text-slate-400">เริ่ม (วินาที)</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={selectedClip.startSec}
                    onChange={(e) => {
                      const trimmed = trimClipBounds(selectedClip, Number(e.target.value), selectedClip.durationSec);
                      updateSelectedClip({ startSec: trimmed.startSec });
                    }}
                    className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 font-mono-tabular"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-[#64748B] dark:text-slate-400">ความยาว (วินาที)</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0.25}
                    value={selectedClip.durationSec}
                    onChange={(e) => {
                      const trimmed = trimClipBounds(selectedClip, selectedClip.startSec, Number(e.target.value));
                      updateSelectedClip({ durationSec: trimmed.durationSec });
                    }}
                    className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 font-mono-tabular"
                  />
                </label>
              </div>

              {selectedClip.kind === 'text' && (
                <label className="block space-y-1">
                  <span className="text-[11px] text-[#64748B] dark:text-slate-400">ข้อความ Title</span>
                  <input
                    type="text"
                    value={selectedClip.textContent || ''}
                    onChange={(e) => updateSelectedClip({ textContent: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5"
                  />
                </label>
              )}

              {selectedClip.kind !== 'audio' ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-[#64748B] dark:text-slate-400">Transition</span>
                    <select
                      value={selectedClip.transitionIn}
                      onChange={(e) =>
                        updateSelectedClip({ transitionIn: e.target.value as VideoTransitionType })
                      }
                      className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1.5"
                    >
                      <option value="none">ไม่มี Transition</option>
                      <option value="crossfade">Crossfade</option>
                      <option value="slide-left">Slide Left</option>
                      <option value="zoom-in">Zoom In</option>
                    </select>
                  </label>

                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Exposure</span>
                      <span className="font-mono-tabular">{selectedClip.effects.exposure}</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={selectedClip.effects.exposure}
                      onChange={(e) =>
                        updateSelectedClip({
                          effects: { ...selectedClip.effects, exposure: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Contrast</span>
                      <span className="font-mono-tabular">{selectedClip.effects.contrast}</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={selectedClip.effects.contrast}
                      onChange={(e) =>
                        updateSelectedClip({
                          effects: { ...selectedClip.effects, contrast: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Saturation</span>
                      <span className="font-mono-tabular">{selectedClip.effects.saturation}</span>
                    </div>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={selectedClip.effects.saturation}
                      onChange={(e) =>
                        updateSelectedClip({
                          effects: { ...selectedClip.effects, saturation: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>ระดับเสียง (Volume)</span>
                      <span className="font-mono-tabular">{selectedClip.volume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={selectedClip.volume}
                      onChange={(e) => updateSelectedClip({ volume: Number(e.target.value) })}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[11px]">Fade-in (s)</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={4}
                        value={selectedClip.fadeInSec}
                        onChange={(e) => updateSelectedClip({ fadeInSec: Number(e.target.value) })}
                        className="w-full rounded border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 font-mono-tabular"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px]">Fade-out (s)</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={4}
                        value={selectedClip.fadeOutSec}
                        onChange={(e) => updateSelectedClip({ fadeOutSec: Number(e.target.value) })}
                        className="w-full rounded border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 font-mono-tabular"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[#64748B] dark:text-slate-400">คลิกเลือกคลิปบนไทม์ไลน์ด้านล่างเพื่อแก้ไข</p>
          )}
        </section>
      </div>

      {/* Multi-Track Timeline */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-3">
        {/* Scrubber */}
        <div className="flex items-center gap-3">
          <span className="font-mono-tabular text-xs font-semibold w-16">
            {formatTimecode(playheadSec)}
          </span>
          <input
            type="range"
            min={0}
            max={totalDurationSec}
            step={0.05}
            value={playheadSec}
            onChange={(e) => {
              setIsPlaying(false);
              setPlayheadSec(Number(e.target.value));
            }}
            aria-label="Playhead Time Scrubber"
            className="flex-1 accent-[#2563EB]"
          />
        </div>

        {markers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {markers.map((mk) => (
              <button
                key={mk.id}
                type="button"
                onClick={() => setPlayheadSec(mk.timeSec)}
                className="inline-flex items-center gap-1 rounded border border-[#E2E8F0] dark:border-slate-700 px-2 py-0.5 font-mono-tabular cursor-pointer"
              >
                <Flag className="h-3 w-3 text-[#2563EB]" />
                <span>{mk.label} ({mk.timeSec}s)</span>
              </button>
            ))}
          </div>
        )}

        {/* Tracks List */}
        <div className="overflow-x-auto border border-[#E2E8F0] dark:border-slate-800 rounded-xl">
          <div style={{ minWidth: `${Math.max(760, totalDurationSec * pxPerSec + 180)}px` }}>
            {tracks.map((track) => {
              const trackClips = clips.filter((c) => c.trackId === track.id);
              return (
                <div
                  key={track.id}
                  className="flex items-stretch border-b last:border-b-0 border-[#E2E8F0] dark:border-slate-800"
                >
                  <div className="w-[170px] shrink-0 flex items-center justify-between gap-2 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-3 border-r border-[#E2E8F0] dark:border-slate-800">
                    <span className="truncate text-xs font-semibold">{track.name}</span>
                    {track.kind === 'audio' && (
                      <button
                        type="button"
                        aria-label={track.muted ? 'เปิดเสียงแทร็ก' : 'ปิดเสียงแทร็ก'}
                        onClick={() =>
                          setTracks((prev) =>
                            prev.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t))
                          )
                        }
                        className="p-1 text-[#475569] dark:text-slate-300 cursor-pointer"
                      >
                        {track.muted ? <VolumeX className="h-3.5 w-3.5 text-red-500" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  <div className="relative flex-1 min-h-[54px] bg-white dark:bg-[#101820] py-1.5">
                    {trackClips.map((clip) => {
                      const active = clip.id === selectedClipId;
                      const leftPx = clip.startSec * pxPerSec;
                      const widthPx = Math.max(44, clip.durationSec * pxPerSec);
                      const audioAsset =
                        clip.kind === 'audio'
                          ? mediaBin.find((m) => m.url === clip.sourceUrl)
                          : undefined;

                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => setSelectedClipId(clip.id)}
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          className={`absolute top-1.5 bottom-1.5 flex flex-col justify-between overflow-hidden rounded-lg border px-2 py-1 text-left cursor-pointer transition-colors ${
                            active
                              ? 'border-[#2563EB] bg-[#2563EB] text-white'
                              : 'border-[#E2E8F0] dark:border-slate-700 bg-[#EEF3FA] dark:bg-[#162947] text-[#101820] dark:text-[#F8FAFC]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-medium truncate">
                            <span className="truncate">{clip.name}</span>
                            <span className="font-mono-tabular text-[10px] opacity-80 shrink-0">
                              {clip.durationSec}s
                            </span>
                          </div>
                          {audioAsset?.waveformPeaks && audioAsset.waveformPeaks.length > 0 && (
                            <div className="flex h-3 items-end gap-[1px]" aria-hidden="true">
                              {audioAsset.waveformPeaks.slice(0, 24).map((pk, idx) => (
                                <span
                                  key={idx}
                                  className="w-1 bg-current opacity-65"
                                  style={{ height: `${Math.max(15, Math.round(pk * 100))}%` }}
                                />
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
