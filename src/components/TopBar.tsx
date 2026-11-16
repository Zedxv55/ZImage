import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Clapperboard,
  FolderHeart,
  Home,
  Images,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Moon,
  Scissors,
  ShieldCheck,
  Sparkles,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import type { QuotaSnapshot } from './StudioView';

export type AppTab =
  | 'studio'
  | 'decompose'
  | 'editor'
  | 'video'
  | 'tools'
  | 'vault'
  | 'dashboard'
  | 'showcase'
  | 'requests'
  | 'admin';

interface TopBarProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  authBusy: boolean;
  quota: QuotaSnapshot;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenLanding?: () => void;
  trialStatusLabel?: string;
}

export function TopBar({
  activeTab,
  onNavigate,
  user,
  authReady,
  isAdmin,
  onSignIn,
  onSignOut,
  authBusy,
  quota,
  theme,
  onToggleTheme,
  onOpenLanding,
  trialStatusLabel,
}: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const creativeNav: Array<{ id: AppTab; label: string; icon: typeof Sparkles }> = [
    { id: 'studio', label: 'สร้างภาพ AI', icon: Sparkles },
    { id: 'decompose', label: 'แยกเลเยอร์ AI', icon: Scissors },
    { id: 'editor', label: 'สตูดิโอแต่งภาพ', icon: Layers },
    { id: 'video', label: 'ตัดต่อวิดีโอ', icon: Clapperboard },
    { id: 'tools', label: 'แก้ปัญหาภาพ', icon: Wrench },
  ];

  const accountNav: Array<{ id: AppTab; label: string; icon: typeof FolderHeart }> = [
    { id: 'vault', label: 'คลังของฉัน', icon: FolderHeart },
    { id: 'dashboard', label: 'แดชบอร์ด & สิทธิ์', icon: LayoutDashboard },
    { id: 'showcase', label: 'แกลเลอรี', icon: Images },
    { id: 'requests', label: 'ร้องขอ', icon: Mail },
    ...(isAdmin ? [{ id: 'admin' as AppTab, label: 'Admin Console', icon: ShieldCheck }] : []),
  ];

  // Mobile thumb bar: strictly 4 primary tabs (total height <= 54px)
  const mobileBottomNav: Array<{ id: AppTab; label: string; icon: typeof Sparkles }> = [
    { id: 'studio', label: 'สร้างภาพ', icon: Sparkles },
    { id: 'decompose', label: 'แยกเลเยอร์', icon: Scissors },
    { id: 'editor', label: 'แต่งภาพ', icon: Layers },
    { id: 'video', label: 'วิดีโอ', icon: Clapperboard },
  ];

  return (
    <>
      {/* Desktop Left Workspace Sidebar */}
      <aside
        aria-label="แถบนำทางสตูดิโอ"
        className="hidden lg:flex lg:w-[252px] lg:shrink-0 lg:flex-col lg:justify-between border-r border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3.5 py-4 sticky top-0 h-screen overflow-y-auto"
      >
        <div className="space-y-5">
          {/* Brand Row */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2563EB]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-[#2563EB] text-white font-display font-bold text-sm shrink-0">
                ZI
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC] whitespace-nowrap">
                ZImage
              </span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
                title={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:border-[#2563EB] hover:text-[#2563EB] cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              {onOpenLanding && (
                <button
                  type="button"
                  onClick={onOpenLanding}
                  title="หน้าแรก"
                  aria-label="กลับหน้าแรก"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:border-[#2563EB] hover:text-[#2563EB] cursor-pointer"
                >
                  <Home className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Primary Creative Modules */}
          <nav aria-label="เครื่องมือสร้างสรรค์หลัก" className="space-y-1">
            {creativeNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#2563EB] text-white font-semibold'
                      : 'text-[#475569] dark:text-slate-300 hover:bg-white dark:hover:bg-[#101820] hover:text-[#101820] dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="studio-hairline-divider" />

          {/* Account & Library Navigation */}
          <nav aria-label="คลังและบัญชีผู้ใช้" className="space-y-1">
            {accountNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#EEF3FA] dark:bg-[#162947] text-[#2563EB] dark:text-[#60A5FA] font-semibold border border-[#2563EB]/30'
                      : 'text-[#64748B] dark:text-slate-400 hover:bg-white dark:hover:bg-[#101820] hover:text-[#101820] dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Compact Quota & Trial Summary (clean unboxed text) */}
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-3 py-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400">
              <span>โควตาภาพ AI วันนี้</span>
              <span className="font-mono-tabular font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                {quota.remaining}/{quota.limit}
              </span>
            </div>
            {trialStatusLabel && (
              <p className="font-mono-tabular text-[11px] text-[#475569] dark:text-slate-300 truncate">
                {trialStatusLabel}
              </p>
            )}
          </div>
        </div>

        {/* Bottom Auth Area */}
        <div className="pt-4 border-t border-[#E2E8F0] dark:border-slate-800 mt-4">
          {!authReady ? (
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ) : user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'สมาชิก'}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white shrink-0">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                    {user.displayName || 'สมาชิก ZImage'}
                  </p>
                  <p className="truncate text-[10px] text-[#64748B] dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={authBusy}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{authBusy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Compact Header (h-12 = 48px, keeps header + bottom nav well under 15% of 844px) */}
      <header className="lg:hidden sticky top-0 z-30 h-12 border-b border-[#E2E8F0] dark:border-slate-800 bg-white/95 dark:bg-[#0B1F3A]/95 backdrop-blur-sm">
        <div className="flex h-full items-center justify-between gap-2 px-3">
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B1F3A] dark:bg-[#2563EB] text-white font-display font-bold text-xs">
              ZI
            </span>
            <span className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
              ZImage
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="font-mono-tabular text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] px-1.5">
              {quota.remaining}/{quota.limit}
            </span>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <button
                type="button"
                onClick={onSignOut}
                disabled={authBusy}
                aria-label="ออกจากระบบ"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-200 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                disabled={authBusy}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>เข้าสู่ระบบ</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="เมนูทั้งหมด"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#101820] dark:text-slate-200 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-3 py-3 shadow-lg">
            {[...creativeNav, ...accountNav].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-[#2563EB] bg-[#2563EB] text-white'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            {onOpenLanding && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenLanding();
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 text-xs text-[#475569] dark:text-slate-300 cursor-pointer whitespace-nowrap"
              >
                <Home className="h-3.5 w-3.5" />
                <span>หน้าแรก</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Mobile Fixed Thumb-Zone Bottom Bar (54px tall) */}
      <nav
        aria-label="แถบนำทางด้านล่าง"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid h-[54px] grid-cols-4 border-t border-[#E2E8F0] dark:border-slate-800 bg-white/95 dark:bg-[#0B1F3A]/95 backdrop-blur-md px-1 py-1"
      >
        {mobileBottomNav.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-medium cursor-pointer ${
                active
                  ? 'bg-[#2563EB] text-white font-semibold'
                  : 'text-[#64748B] dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
