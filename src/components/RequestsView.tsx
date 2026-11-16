import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Clock,
  Mail,
  Send,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  fetchTodayUserRequest,
  getTodayDateKey,
  submitDailyRequest,
  subscribeToMyRequests,
} from '../lib/firebase';
import type { RequestRecord } from '../lib/firebase';
import type { RequestStatus } from '../utils/promptLogic';

const CLIENT_TOKEN_STORAGE_KEY = 'zimage_request_client_token';

function getOrCreateClientToken(): string {
  try {
    const existing = localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
    if (existing) return existing;
    const generated = `zreq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'zreq-session';
  }
}

interface TimelineSummaryItem {
  id: string;
  authorName: string;
  subject: string;
  rating: number;
  status: RequestStatus;
  adminNote: string;
  dateKey: string;
  createdAtIso: string;
}

const STATUS_STEPS: Array<{ id: RequestStatus; label: string }> = [
  { id: 'submitted', label: 'ส่งคำขอ' },
  { id: 'reviewed', label: 'รับเรื่อง' },
  { id: 'in-progress', label: 'กำลังพัฒนา' },
  { id: 'completed', label: 'เสร็จสิ้น' },
];

export function statusIndex(status: RequestStatus): number {
  const idx = STATUS_STEPS.findIndex((s) => s.id === status);
  return idx >= 0 ? idx : 0;
}

interface RequestsViewProps {
  user: User | null;
}

export function RequestsView({ user }: RequestsViewProps) {
  const [authorName, setAuthorName] = useState(
    user?.displayName || user?.email?.split('@')[0] || ''
  );
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);

  const [todayMemberRequest, setTodayMemberRequest] = useState<RequestRecord | null>(null);
  const [myMemberRequests, setMyMemberRequests] = useState<RequestRecord[]>([]);

  const [guestSummary, setGuestSummary] = useState<{
    guestCount: number;
    guestAvgRating: number;
    submittedToday: boolean;
    recentTimeline: TimelineSummaryItem[];
  }>({
    guestCount: 0,
    guestAvgRating: 0,
    submittedToday: false,
    recentTimeline: [],
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName) {
      setAuthorName(user.displayName);
    }
  }, [user?.displayName]);

  const loadSummary = useCallback(async () => {
    try {
      const token = getOrCreateClientToken();
      const res = await fetch(`/api/requests/summary?clientToken=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        guestCount: number;
        guestAvgRating: number;
        submittedToday: boolean;
        recentTimeline: TimelineSummaryItem[];
      };
      setGuestSummary(data);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!user) {
      setTodayMemberRequest(null);
      setMyMemberRequests([]);
      return;
    }
    fetchTodayUserRequest(user.uid)
      .then(setTodayMemberRequest)
      .catch(() => setTodayMemberRequest(null));

    const unsub = subscribeToMyRequests(
      user.uid,
      (items) => {
        setMyMemberRequests(items);
        const today = getTodayDateKey();
        const foundToday = items.find((r) => r.dateKey === today) || null;
        setTodayMemberRequest(foundToday);
      },
      () => {
        // Ignore transient listener error
      }
    );
    return () => unsub();
  }, [user]);

  const alreadySubmittedToday = Boolean(
    user ? todayMemberRequest : guestSummary.submittedToday
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (alreadySubmittedToday) return;

    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject || !cleanMessage) {
      setErrorMsg('กรุณากรอกหัวข้อและข้อความในจดหมายถึงเจ้าหน้าที่ให้ครบถ้วน');
      return;
    }

    setErrorMsg(null);
    setSubmitSuccess(null);
    setSubmitting(true);

    try {
      if (user) {
        const created = await submitDailyRequest({
          user,
          subject: cleanSubject,
          message: cleanMessage,
          rating,
        });
        setTodayMemberRequest(created);
      } else {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientToken: getOrCreateClientToken(),
            authorName: authorName.trim() || 'ผู้เยี่ยมชม ZImage',
            subject: cleanSubject,
            message: cleanMessage,
            rating,
            dateKey: getTodayDateKey(),
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErrorMsg(data.error || 'ไม่สามารถส่งคำขอได้ในขณะนี้');
          return;
        }
        await loadSummary();
      }
      setSubject('');
      setMessage('');
      setSubmitSuccess('ส่งจดหมายคำขอถึงเจ้าหน้าที่ ZImage เรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็น!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setSubmitting(false);
    }
  };

  const timelineItems: TimelineSummaryItem[] = user
    ? [
        ...myMemberRequests.map((r) => ({
          id: r.id,
          authorName: r.authorName,
          subject: r.subject,
          rating: r.rating,
          status: r.status,
          adminNote: r.adminNote,
          dateKey: r.dateKey,
          createdAtIso: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : r.dateKey,
        })),
        ...guestSummary.recentTimeline,
      ].slice(0, 12)
    : guestSummary.recentTimeline;

  const totalCountDisplay = guestSummary.guestCount + myMemberRequests.length;

  return (
    <div className="mx-auto max-w-[1160px] px-4 py-6 sm:px-6 lg:py-8 space-y-8">
      {/* Header + Counter Metrics */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            จดหมายคำขอถึงเจ้าหน้าที่ (Daily Requests)
          </h1>
          <p className="mt-1 text-sm text-[#64748B] dark:text-slate-400">
            เสนอแนะฟีเจอร์ใหม่ แจ้งปัญหา หรือให้คะแนน ZImage ได้วันละ 1 ฉบับ เชื่อมต่อตรงถึงไทม์ไลน์แอดมิน
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-4 py-2.5 shadow-sm">
            <span className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400">ยอดคำขอในระบบ</span>
            <span className="font-display text-xl font-bold text-[#101820] dark:text-[#F8FAFC] font-mono-tabular">
              {totalCountDisplay}
            </span>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-4 py-2.5 shadow-sm">
            <span className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400">คะแนนเฉลี่ย</span>
            <span className="inline-flex items-center gap-1 font-display text-xl font-bold text-[#2563EB] dark:text-[#60A5FA] font-mono-tabular">
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span>{guestSummary.guestAvgRating || '5.0'}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[480px_1fr] lg:items-start">
        {/* Left: Letter Composition Card */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800 pb-3.5">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#2563EB] dark:text-[#60A5FA]" />
              <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                เขียนจดหมายถึงทีมงาน ZImage
              </h2>
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              1 ฉบับ / วัน
            </span>
          </div>

          {alreadySubmittedToday ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>วันนี้คุณส่งจดหมายคำขอถึงเจ้าหน้าที่แล้ว</span>
              </div>
              {todayMemberRequest && (
                <div className="rounded-lg bg-white dark:bg-[#0B1F3A] p-3 text-xs space-y-1 border border-emerald-200 dark:border-emerald-900">
                  <p className="font-semibold text-[#101820] dark:text-[#F8FAFC]">{todayMemberRequest.subject}</p>
                  <p className="text-[#64748B] dark:text-slate-400">{todayMemberRequest.message}</p>
                  <p className="text-[11px] font-mono-tabular text-[#2563EB] dark:text-[#60A5FA] pt-1">
                    สถานะปัจจุบัน: {STATUS_STEPS[statusIndex(todayMemberRequest.status)].label}
                  </p>
                </div>
              )}
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                ระบบจำกัดการส่งวันละ 1 ครั้ง เพื่อให้บริการตรวจสอบคำขอได้อย่างทั่วถึง คุณสามารถส่งฉบับใหม่ได้ในวันพรุ่งนี้
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!user && (
                <div className="space-y-1">
                  <label htmlFor="req-author" className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                    ชื่อผู้ส่ง (ไม่บังคับ)
                  </label>
                  <input
                    id="req-author"
                    type="text"
                    maxLength={80}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="เช่น คุณเอ / ฝ่ายออกแบบ..."
                    className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-sm text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="req-subject" className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  เรื่อง / หัวข้อคำขอ
                </label>
                <input
                  id="req-subject"
                  type="text"
                  maxLength={140}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="เช่น อยากให้เพิ่มเครื่องมือลบเงา หรือขนาดพรินต์โปสการ์ด..."
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-sm text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="req-message" className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  รายละเอียดถึงเจ้าหน้าที่
                </label>
                <textarea
                  id="req-message"
                  rows={5}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="เรียนทีมงาน ZImage... เขียนสิ่งที่ต้องการ แนะนำ หรือปัญหาที่พบได้อย่างอิสระ"
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2.5 text-sm leading-relaxed text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              {/* Star Rating 1 - 5 */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  ให้คะแนนความพึงพอใจเว็บไซต์ (1–5 ดาว)
                </span>
                <div className="flex items-center gap-1.5" role="group" aria-label="ให้คะแนนดาว">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverRating || rating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(star)}
                        aria-label={`${star} ดาว`}
                        className="rounded-lg p-1.5 hover:bg-[#F7F9FC] dark:hover:bg-[#0B1F3A] cursor-pointer transition-transform active:scale-95"
                      >
                        <Star
                          className={`h-6 w-6 transition-colors ${
                            active ? 'fill-amber-400 text-amber-500' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="ml-2 text-xs font-mono-tabular font-semibold text-[#64748B] dark:text-slate-400">
                    {rating} / 5 ดาว
                  </span>
                </div>
              </div>

              {errorMsg && (
                <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                  {errorMsg}
                </div>
              )}

              {submitSuccess && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                  {submitSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                <span>{submitting ? 'กำลังส่งจดหมาย...' : 'ส่งจดหมายคำขอถึงเจ้าหน้าที่'}</span>
              </button>
            </form>
          )}
        </section>

        {/* Right: Connected Chronological Timeline */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800 pb-3.5">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#2563EB] dark:text-[#60A5FA]" />
              <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                ไทม์ไลน์ติดตามสถานะคำขอ
              </h2>
            </div>
            <span className="text-xs text-[#64748B] dark:text-slate-400">อัปเดตเชื่อมต่อกับหน้าแอดมิน</span>
          </div>

          {timelineItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Sparkles className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-[#64748B] dark:text-slate-400">ยังไม่มีคำขอในไทม์ไลน์ — ส่งจดหมายฉบับแรกได้เลย</p>
            </div>
          ) : (
            <ol className="space-y-4">
              {timelineItems.map((item) => {
                const sIdx = statusIndex(item.status);
                return (
                  <li key={item.id} className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                        {item.subject}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-mono-tabular text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                        {item.rating}/5
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      โดย {item.authorName} · วันที่ {item.dateKey}
                    </p>

                    {/* 4-stage Connected Step Progress */}
                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {STATUS_STEPS.map((step, i) => {
                        const done = i <= sIdx;
                        return (
                          <div key={step.id} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                done
                                  ? item.status === 'completed'
                                    ? 'bg-emerald-600'
                                    : 'bg-[#2563EB]'
                                  : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                            />
                            <p
                              className={`text-[10px] font-medium ${
                                done ? 'text-[#101820] dark:text-[#F8FAFC]' : 'text-[#64748B] dark:text-slate-500'
                              }`}
                            >
                              {step.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {item.adminNote && (
                      <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-[#101820] px-3 py-2 text-xs text-[#101820] dark:text-slate-200">
                        <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">หมายเหตุจากแอดมิน: </span>
                        {item.adminNote}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
