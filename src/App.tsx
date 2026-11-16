import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { AlertCircle, Info, X } from 'lucide-react';
import {
  auth,
  createAlbum,
  deleteAlbum,
  deleteRequestAdmin,
  deleteSavedPrompt,
  deleteStudioProject,
  deleteVaultImage,
  fetchAllMembersAdmin,
  moveImagesToAlbum,
  renameAlbum,
  saveImageToVault,
  savePromptToFirestore,
  saveStudioProjectToFirestore,
  signInWithGoogle,
  signOutUser,
  subscribeToAllImagesAdmin,
  subscribeToAllRequestsAdmin,
  subscribeToFeaturedShowcase,
  subscribeToSavedPrompts,
  subscribeToStudioProjects,
  subscribeToUserAlbums,
  subscribeToUserVault,
  syncUserProfile,
  toggleImageFavorite,
  updateImageVisibility,
  updateRequestStatusAdmin,
} from './lib/firebase';
import type {
  AlbumRecord,
  MemberRecord,
  RequestRecord,
  SavedPromptRecord,
  StudioProjectRecord,
  VaultImageRecord,
} from './lib/firebase';
import {
  DEFAULT_DAILY_GENERATION_LIMIT,
  RECRAFT_MODEL,
  isAdminUser,
} from './utils/promptLogic';
import type {
  AspectRatioId,
  ImageVisibility,
  PhotorealismPresetId,
  PromptEditorMode,
  RequestStatus,
  StylePresetId,
  VaultItemType,
} from './utils/promptLogic';
import { computeEffectiveAccessStatus } from './utils/trialReferralRules';
import type { EntitlementState } from './utils/trialReferralRules';
import type { ShowcaseItem } from './data/showcasePresets';
import { TopBar } from './components/TopBar';
import type { AppTab } from './components/TopBar';
import { LandingView } from './components/LandingView';
import { StudioView } from './components/StudioView';
import type { QuotaSnapshot, SessionCreation } from './components/StudioView';
import { LayerDecomposeView } from './components/LayerDecomposeView';
import { ImageToolsView } from './components/ImageToolsView';
import { EditorView } from './components/EditorView';
import type { EditorSourceItem } from './components/EditorView';
import { VideoEditorView } from './components/VideoEditorView';
import { VaultView } from './components/VaultView';
import { DashboardView } from './components/DashboardView';
import type { DashboardAiJobRecord, DashboardReferralRecord } from './components/DashboardView';
import { ShowcaseView } from './components/ShowcaseView';
import { RequestsView } from './components/RequestsView';
import { AdminView } from './components/AdminView';
import type { ServerArchiveImageItem, ServerGuestRequestRecord } from './components/AdminView';
import { LightboxModal } from './components/LightboxModal';
import type { LightboxImageData } from './components/LightboxModal';

const THEME_STORAGE_KEY = 'zimage-theme';
const PENDING_REF_STORAGE_KEY = 'zimage-pending-ref';

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getInitialAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<AppTab>('studio');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [enteredWorkspace, setEnteredWorkspace] = useState<boolean>(getInitialAutostart);

  // System Maintenance Banner (from public config)
  const [maintenanceBanner, setMaintenanceBanner] = useState<string | null>(null);

  // Quota state (server daily quota for AI image generation)
  const [quota, setQuota] = useState<QuotaSnapshot>({
    limit: DEFAULT_DAILY_GENERATION_LIMIT,
    used: 0,
    remaining: DEFAULT_DAILY_GENERATION_LIMIT,
  });

  // Trial / Referral / Entitlement state
  const [entitlement, setEntitlement] = useState<EntitlementState | null>(null);
  const [referralHistory, setReferralHistory] = useState<DashboardReferralRecord[]>([]);
  const [recentJobs, setRecentJobs] = useState<DashboardAiJobRecord[]>([]);
  const [entitlementLoading, setEntitlementLoading] = useState(false);

  // Studio prompt state
  const [ideaInput, setIdeaInput] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [stylePreset, setStylePreset] = useState<StylePresetId>('auto');
  const [photorealismPreset, setPhotorealismPreset] = useState<PhotorealismPresetId>('none');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>('16:9');
  const [seedValue, setSeedValue] = useState('');
  const [promptMode, setPromptMode] = useState<PromptEditorMode>('simple');
  const [textInImage, setTextInImage] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Session & Editor / Decompose sources
  const [sessionCreations, setSessionCreations] = useState<SessionCreation[]>([]);
  const [activeCreation, setActiveCreation] = useState<SessionCreation | null>(null);
  const [editorSource, setEditorSource] = useState<EditorSourceItem | null>(null);
  const [decomposeSource, setDecomposeSource] = useState<EditorSourceItem | null>(null);
  const [multiEditorSources, setMultiEditorSources] = useState<EditorSourceItem[] | undefined>(
    undefined
  );

  // Vault, Albums, Saved Prompts & Studio Projects
  const [vaultImages, setVaultImages] = useState<VaultImageRecord[]>([]);
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [savedPrompts, setSavedPrompts] = useState<SavedPromptRecord[]>([]);
  const [studioProjects, setStudioProjects] = useState<StudioProjectRecord[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);

  const [featuredImages, setFeaturedImages] = useState<VaultImageRecord[]>([]);

  const [adminImages, setAdminImages] = useState<VaultImageRecord[]>([]);
  const [serverArchiveImages, setServerArchiveImages] = useState<ServerArchiveImageItem[]>([]);
  const [adminLoadingImages, setAdminLoadingImages] = useState(false);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [firestoreRequests, setFirestoreRequests] = useState<RequestRecord[]>([]);
  const [serverGuestRequests, setServerGuestRequests] = useState<ServerGuestRequestRecord[]>([]);

  const [lightboxItem, setLightboxItem] = useState<LightboxImageData | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);

  const isAdmin = useMemo(
    () => isAdminUser(user?.email, user?.emailVerified),
    [user?.email, user?.emailVerified]
  );

  // Sync light/dark class on <html> and persist preference
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Capture ?ref= referral code from URL and load public maintenance config
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref')?.trim();
      if (refCode) {
        window.localStorage.setItem(PENDING_REF_STORAGE_KEY, refCode.toUpperCase());
      }
    } catch {
      // Ignore URL parsing issues
    }

    fetch('/api/system/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: { maintenanceMode?: boolean; maintenanceBanner?: string } | null) => {
        if (cfg?.maintenanceMode && cfg.maintenanceBanner) {
          setMaintenanceBanner(cfg.maintenanceBanner);
        }
      })
      .catch(() => {
        // Non-fatal
      });
  }, []);

  // Fetch daily AI image generation quota from server
  const refreshQuota = useCallback(async (currentUser: User | null) => {
    try {
      const headers: Record<string, string> = {};
      if (currentUser) {
        const token = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch('/api/quota', { headers });
      if (res.ok) {
        const data = (await res.json()) as Partial<QuotaSnapshot>;
        if (typeof data.limit === 'number' && typeof data.remaining === 'number') {
          setQuota({
            limit: data.limit,
            used: Number(data.used || 0),
            remaining: data.remaining,
            dateKey: data.dateKey,
          });
        }
      }
    } catch {
      // Non-fatal fallback
    }
  }, []);

  // Sync user entitlement + referral history + recent jobs (and enforce SESSION_REVOKED)
  const syncEntitlement = useCallback(async (targetUser: User | null) => {
    if (!targetUser) {
      setEntitlement(null);
      setReferralHistory([]);
      setRecentJobs([]);
      setEntitlementLoading(false);
      return;
    }

    setEntitlementLoading(true);
    try {
      const token = await targetUser.getIdToken();
      const res = await fetch('/api/me/entitlement', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        const errPayload = (await res.json().catch(() => null)) as {
          errorCode?: string;
          error?: string;
        } | null;
        if (errPayload?.errorCode === 'SESSION_REVOKED') {
          await signOutUser();
          setEnteredWorkspace(false);
          setAppNotice(
            errPayload.error ||
              'เซสชันของคุณถูกบังคับออกจากระบบโดยผู้ดูแล กรุณาเข้าสู่ระบบใหม่อีกครั้ง'
          );
          return;
        }
      }

      if (res.ok) {
        const data = (await res.json()) as {
          entitlement?: EntitlementState;
          referralHistory?: DashboardReferralRecord[];
          recentJobs?: DashboardAiJobRecord[];
        };
        if (data.entitlement) {
          setEntitlement(data.entitlement);
        }
        setReferralHistory(data.referralHistory || []);
        setRecentJobs(data.recentJobs || []);

        // Auto-claim pending referral code if user hasn't been referred yet
        try {
          const pendingRef = window.localStorage.getItem(PENDING_REF_STORAGE_KEY);
          if (
            pendingRef &&
            data.entitlement &&
            !data.entitlement.referredByUid &&
            targetUser.emailVerified
          ) {
            window.localStorage.removeItem(PENDING_REF_STORAGE_KEY);
            const claimRes = await fetch('/api/referrals/claim', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ referralCode: pendingRef }),
            });
            const claimData = (await claimRes.json().catch(() => null)) as {
              ok?: boolean;
              inviterEmail?: string;
              entitlement?: EntitlementState;
              error?: string;
            } | null;
            if (claimRes.ok && claimData?.ok) {
              if (claimData.entitlement) {
                setEntitlement(claimData.entitlement);
              }
              setAppNotice(
                `รับสิทธิ์คำแนะนำจาก ${claimData.inviterEmail || pendingRef} เรียบร้อยแล้ว`
              );
            }
          }
        } catch {
          // Non-fatal auto-claim fallback
        }
      }
    } catch {
      // Non-fatal fallback
    } finally {
      setEntitlementLoading(false);
    }
  }, []);

  const handleClaimReferralCode = useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      if (!user) {
        return { ok: false, message: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนใช้รหัสแนะนำ' };
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/referrals/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ referralCode: code }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          inviterEmail?: string;
          deltaDaysGranted?: number;
          milestoneStep?: number;
          entitlement?: EntitlementState;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            message: data.error || 'ไม่สามารถใช้รหัสแนะนำได้ในขณะนี้',
          };
        }
        await syncEntitlement(user);
        return {
          ok: true,
          message: `ยืนยันรหัสแนะนำจาก ${data.inviterEmail || 'ผู้แนะนำ'} สำเร็จ (ขั้นที่ ${data.milestoneStep || 1})`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
        };
      }
    },
    [user, syncEntitlement]
  );

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      refreshQuota(nextUser);
      if (nextUser) {
        setEnteredWorkspace(true);
        try {
          await syncUserProfile(nextUser);
        } catch (err) {
          console.warn('Profile sync notice:', err instanceof Error ? err.message : String(err));
        }
        syncEntitlement(nextUser);
      } else {
        setEntitlement(null);
        setReferralHistory([]);
        setRecentJobs([]);
        setVaultImages([]);
        setAlbums([]);
        setSavedPrompts([]);
        setStudioProjects([]);
        setAdminImages([]);
        setServerArchiveImages([]);
        setMembers([]);
        setFirestoreRequests([]);
        setServerGuestRequests([]);
      }
    });
    return () => unsub();
  }, [refreshQuota, syncEntitlement]);

  // Featured showcase subscription (public)
  useEffect(() => {
    const unsub = subscribeToFeaturedShowcase((items) => {
      setFeaturedImages(items);
    });
    return () => unsub();
  }, []);

  // Personal Vault, Albums, SavedPrompts & StudioProjects subscriptions (only when authenticated)
  useEffect(() => {
    if (!authReady || !user) {
      setVaultImages([]);
      setAlbums([]);
      setSavedPrompts([]);
      setStudioProjects([]);
      setVaultLoading(false);
      return;
    }
    setVaultLoading(true);
    const unsubVault = subscribeToUserVault(
      user.uid,
      (items) => {
        setVaultImages(items);
        setVaultLoading(false);
      },
      (err) => {
        setVaultLoading(false);
        setAppNotice(`ไม่สามารถโหลดคลังภาพส่วนตัวได้: ${err.message}`);
      }
    );
    const unsubAlbums = subscribeToUserAlbums(
      user.uid,
      (items) => {
        setAlbums(items);
      },
      () => {
        // Ignore transient listener error
      }
    );
    const unsubPrompts = subscribeToSavedPrompts(
      user.uid,
      (items) => {
        setSavedPrompts(items);
      },
      () => {
        // Ignore transient listener error
      }
    );
    const unsubProjects = subscribeToStudioProjects(
      user.uid,
      (items) => {
        setStudioProjects(items);
      },
      () => {
        // Ignore transient listener error
      }
    );
    return () => {
      unsubVault();
      unsubAlbums();
      unsubPrompts();
      unsubProjects();
    };
  }, [authReady, user]);

  const fetchServerAdminData = useCallback(async () => {
    if (!user || !isAdmin) return;
    try {
      const idToken = await user.getIdToken();
      const [archRes, reqRes] = await Promise.all([
        fetch('/api/admin/generated-archive', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch('/api/admin/requests', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);
      if (archRes.ok) {
        const archData = (await archRes.json()) as { items?: ServerArchiveImageItem[] };
        setServerArchiveImages(archData.items || []);
      }
      if (reqRes.ok) {
        const reqData = (await reqRes.json()) as { items?: ServerGuestRequestRecord[] };
        setServerGuestRequests(reqData.items || []);
      }
    } catch {
      // Non-fatal server fetch warning
    }
  }, [user, isAdmin]);

  const refreshAdminAll = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoadingMembers(true);
    try {
      const [memberList] = await Promise.all([
        fetchAllMembersAdmin(),
        fetchServerAdminData(),
      ]);
      setMembers(memberList);
    } catch (err) {
      setAppNotice(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลผู้ดูแลระบบได้');
    } finally {
      setLoadingMembers(false);
    }
  }, [user, isAdmin, fetchServerAdminData]);

  // Admin subscriptions
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAdminImages([]);
      setServerArchiveImages([]);
      setFirestoreRequests([]);
      setServerGuestRequests([]);
      setAdminLoadingImages(false);
      return;
    }
    setAdminLoadingImages(true);
    const unsubImages = subscribeToAllImagesAdmin(
      (items) => {
        setAdminImages(items);
        setAdminLoadingImages(false);
      },
      (err) => {
        setAdminLoadingImages(false);
        setAppNotice(`ไม่สามารถโหลดข้อมูลภาพผู้ดูแลระบบได้: ${err.message}`);
      }
    );
    const unsubReqs = subscribeToAllRequestsAdmin(
      (items) => {
        setFirestoreRequests(items);
      },
      () => {
        // Ignore transient listener error
      }
    );
    refreshAdminAll();
    return () => {
      unsubImages();
      unsubReqs();
    };
  }, [authReady, user, isAdmin, refreshAdminAll]);

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAppNotice(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ';
      if (!msg.includes('popup-closed-by-user')) {
        setAppNotice(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutUser();
      setEnteredWorkspace(false);
      if (activeTab === 'admin' || activeTab === 'dashboard') {
        setActiveTab('studio');
      }
    } catch (err) {
      setAppNotice(err instanceof Error ? err.message : 'ออกจากระบบไม่สำเร็จ');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveCreation = async (creation: SessionCreation) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    if (creation.savedDocId) return;

    const docId = await saveImageToVault({
      user,
      originalPrompt: creation.originalPrompt,
      enhancedPrompt: creation.enhancedPrompt,
      stylePreset: creation.stylePreset,
      aspectRatio: creation.aspectRatio,
      dimensionsLabel: creation.dimensionsLabel,
      rawImageUrl: creation.imageUrl,
      itemType: 'generated',
    });

    setSessionCreations((prev) =>
      prev.map((item) => (item.id === creation.id ? { ...item, savedDocId: docId } : item))
    );
    setActiveCreation((prev) =>
      prev && prev.id === creation.id ? { ...prev, savedDocId: docId } : prev
    );
  };

  const handleSavePromptToCloud = async (payload: {
    title: string;
    originalPrompt: string;
    enhancedPrompt: string;
    negativePrompt: string;
    stylePreset: StylePresetId;
    photorealismPreset: PhotorealismPresetId;
    aspectRatio: AspectRatioId;
    model: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await savePromptToFirestore({
      user,
      title: payload.title,
      prompt: payload.enhancedPrompt || payload.originalPrompt,
      negativePrompt: payload.negativePrompt,
      stylePreset: payload.stylePreset,
      photorealismPreset: payload.photorealismPreset,
      aspectRatio: payload.aspectRatio,
    });
    setAppNotice('บันทึกพรอมต์ลงคลาวด์ส่วนตัวเรียบร้อยแล้ว');
  };

  const handleUpdateSessionCreation = (id: string, patch: Partial<SessionCreation>) => {
    setSessionCreations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
    setActiveCreation((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const handleRemoveSessionCreation = (id: string) => {
    setSessionCreations((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setActiveCreation((curr) => (curr?.id === id ? next[0] || null : curr));
      return next;
    });
  };

  const handleSyncAllSessionCreations = async () => {
    if (!user) return;
    const unsaved = sessionCreations.filter((item) => !item.savedDocId);
    for (const item of unsaved) {
      await handleSaveCreation(item);
    }
  };

  const handleContinuePrompt = (item: LightboxImageData) => {
    setIdeaInput(item.originalPrompt);
    setEnhancedPrompt(item.enhancedPrompt);
    setStylePreset(item.stylePreset);
    setAspectRatio(item.aspectRatio);
    setEnteredWorkspace(true);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUseShowcasePrompt = (
    item: ShowcaseItem,
    openAdvanced?: boolean,
    styleOnly?: boolean
  ) => {
    if (styleOnly) {
      setStylePreset(item.stylePreset);
      setPhotorealismPreset(item.photorealismPreset);
      setAspectRatio(item.aspectRatio);
    } else {
      setIdeaInput(item.originalPrompt);
      setEnhancedPrompt(item.enhancedPrompt);
      setNegativePrompt(item.negativePrompt);
      setStylePreset(item.stylePreset);
      setPhotorealismPreset(item.photorealismPreset);
      setAspectRatio(item.aspectRatio);
      setSeedValue(item.seed ? String(item.seed) : '');
      if (openAdvanced) {
        setPromptMode('advanced');
      }
    }
    setEnteredWorkspace(true);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate another variation right from Vault using the same prompt + new random seed
  const handleGenerateVariation = async (item: LightboxImageData) => {
    const promptToUse = (item.enhancedPrompt || item.originalPrompt).trim();
    if (!promptToUse) return;
    const randomSeed = Math.floor(Math.random() * 2147483647);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    }

    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: promptToUse,
        originalPrompt: item.originalPrompt,
        stylePreset: item.stylePreset,
        aspectRatio: item.aspectRatio,
        seed: randomSeed,
        model: item.modelName || RECRAFT_MODEL,
        ownerName: user?.displayName || 'สมาชิก ZImage',
        ownerEmail: user?.email || '',
        ownerUid: user?.uid || '',
      }),
    });
    const data = (await res.json()) as {
      imageUrl?: string;
      durationMs?: number;
      quota?: QuotaSnapshot;
      error?: string;
    };
    if (data.quota) setQuota(data.quota);
    if (!res.ok || !data.imageUrl) {
      setAppNotice(data.error || 'ไม่สามารถเจนอีกแบบได้ในขณะนี้');
      return;
    }

    const creation: SessionCreation = {
      id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      originalPrompt: item.originalPrompt,
      enhancedPrompt: promptToUse,
      stylePreset: item.stylePreset,
      aspectRatio: item.aspectRatio,
      seed: randomSeed,
      imageUrl: data.imageUrl,
      originalImageUrl: data.imageUrl,
      durationMs: Number(data.durationMs || 0),
      createdAtIso: new Date().toISOString(),
    };

    if (user && autoSaveEnabled) {
      try {
        const docId = await saveImageToVault({
          user,
          originalPrompt: creation.originalPrompt,
          enhancedPrompt: creation.enhancedPrompt,
          stylePreset: creation.stylePreset,
          aspectRatio: creation.aspectRatio,
          rawImageUrl: creation.imageUrl,
          itemType: 'generated',
          sourceImageId: item.id,
        });
        creation.savedDocId = docId;
      } catch {
        // User still sees creation in studio session
      }
    }

    setSessionCreations((prev) => [creation, ...prev]);
    setActiveCreation(creation);
    setEnteredWorkspace(true);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenInEditor = (item: LightboxImageData) => {
    setMultiEditorSources(undefined);
    setEditorSource({
      id: item.id,
      title: item.title || item.originalPrompt,
      imageUrl: item.imageUrl,
      originalPrompt: item.originalPrompt,
      enhancedPrompt: item.enhancedPrompt,
      stylePreset: item.stylePreset,
      aspectRatio: item.aspectRatio,
      sourceImageId: item.sourceImageId || item.id,
      projectJson: item.projectJson,
    });
    setEnteredWorkspace(true);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenInDecompose = (item: LightboxImageData) => {
    setDecomposeSource({
      id: item.id,
      title: item.title || item.originalPrompt,
      imageUrl: item.imageUrl,
      originalPrompt: item.originalPrompt,
      enhancedPrompt: item.enhancedPrompt,
      stylePreset: item.stylePreset,
      aspectRatio: item.aspectRatio,
      sourceImageId: item.sourceImageId || item.id,
    });
    setEnteredWorkspace(true);
    setActiveTab('decompose');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenMultipleInEditor = (items: LightboxImageData[]) => {
    if (items.length === 0) return;
    setEditorSource(null);
    setMultiEditorSources(
      items.map((item) => ({
        id: item.id,
        title: item.title || item.originalPrompt,
        imageUrl: item.imageUrl,
        originalPrompt: item.originalPrompt,
        enhancedPrompt: item.enhancedPrompt,
        stylePreset: item.stylePreset,
        aspectRatio: item.aspectRatio,
        sourceImageId: item.id,
      }))
    );
    setEnteredWorkspace(true);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveEditedPngToVault = async (payload: {
    imageDataUrl: string;
    originalPrompt: string;
    enhancedPrompt: string;
    stylePreset: StylePresetId;
    aspectRatio: AspectRatioId;
    dimensionsLabel?: string;
    itemType: VaultItemType;
    sourceImageId?: string;
    projectJson?: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await saveImageToVault({
      user,
      originalPrompt: payload.originalPrompt,
      enhancedPrompt: payload.enhancedPrompt,
      stylePreset: payload.stylePreset,
      aspectRatio: payload.aspectRatio,
      dimensionsLabel: payload.dimensionsLabel,
      rawImageUrl: payload.imageDataUrl,
      itemType: payload.itemType,
      sourceImageId: payload.sourceImageId,
      projectJson: payload.projectJson,
    });
  };

  const handleSaveStudioProjectToCloud = async (payload: {
    title: string;
    kind: 'editor';
    projectJson: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await saveStudioProjectToFirestore({
      user,
      title: payload.title,
      kind: payload.kind,
      projectJson: payload.projectJson,
    });
    setAppNotice('บันทึกโปรเจกต์สตูดิโอลงคลาวด์สำเร็จ');
  };

  const handleDeleteServerArchive = async (archiveId: string) => {
    if (!user || !isAdmin) return;
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/admin/generated-archive/${encodeURIComponent(archiveId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      setServerArchiveImages((prev) => prev.filter((item) => item.id !== archiveId));
    }
  };

  const handleUpdateRequestStatus = async (
    source: 'firestore' | 'guest',
    id: string,
    status: RequestStatus,
    adminNote: string
  ) => {
    if (!user || !isAdmin) return;
    if (source === 'firestore') {
      await updateRequestStatusAdmin(id, status, adminNote);
      return;
    }
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ status, adminNote }),
    });
    if (res.ok) {
      setServerGuestRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, adminNote } : r))
      );
    }
  };

  const handleDeleteRequest = async (source: 'firestore' | 'guest', id: string) => {
    if (!user || !isAdmin) return;
    if (source === 'firestore') {
      await deleteRequestAdmin(id);
      return;
    }
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      setServerGuestRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const trialStatusLabel = useMemo(() => {
    if (!user || !entitlement) return undefined;
    const eff = computeEffectiveAccessStatus(entitlement);
    if (eff.status === 'active_admin') return 'ผู้ดูแลระบบ';
    if (eff.status === 'active_pro') return 'Pro';
    if (eff.status === 'suspended') return 'ระงับสิทธิ์';
    if (eff.status === 'expired') return 'หมดเวลา 72 ชม.';
    return eff.remainingLabel;
  }, [user, entitlement]);

  // Pre-Login Landing Page when unauthenticated and guest has not entered workspace
  if (!user && !enteredWorkspace) {
    return (
      <>
        <LandingView
          onSignIn={handleSignIn}
          authBusy={authBusy}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onEnterGuestWorkspace={(tab = 'studio') => {
            setEnteredWorkspace(true);
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onUseShowcasePrompt={handleUseShowcasePrompt}
          onOpenInEditorFromLanding={(item) =>
            handleOpenInEditor({
              id: item.id,
              title: item.title,
              imageUrl: item.imageUrl,
              originalPrompt: item.originalPrompt,
              enhancedPrompt: item.enhancedPrompt,
              stylePreset: item.stylePreset,
              aspectRatio: item.aspectRatio,
            })
          }
          onOpenShowcasePreview={setLightboxItem}
        />
        <LightboxModal
          item={lightboxItem}
          vaultImages={vaultImages}
          onSelectVaultRecord={(rec) =>
            setLightboxItem({
              id: rec.id,
              imageUrl: rec.imageDataUrl,
              originalPrompt: rec.originalPrompt,
              enhancedPrompt: rec.enhancedPrompt,
              stylePreset: rec.stylePreset,
              aspectRatio: rec.aspectRatio,
              authorName: rec.ownerName,
              itemType: rec.itemType,
              sourceImageId: rec.sourceImageId,
              projectJson: rec.projectJson,
              albumId: rec.albumId,
            })
          }
          onClose={() => setLightboxItem(null)}
          onContinuePrompt={handleContinuePrompt}
          onOpenInEditor={handleOpenInEditor}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-[#F8FAFC]">
      <TopBar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        user={user}
        authReady={authReady}
        isAdmin={isAdmin}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authBusy={authBusy}
        quota={quota}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenLanding={!user ? () => setEnteredWorkspace(false) : undefined}
        trialStatusLabel={trialStatusLabel}
      />

      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {maintenanceBanner && (
          <div className="mx-auto mt-4 w-full max-w-[1360px] px-4 sm:px-6">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <span>{maintenanceBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceBanner(null)}
                aria-label="ปิดประกาศ"
                className="rounded p-1 hover:bg-amber-200/40 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {appNotice && (
          <div className="mx-auto mt-4 w-full max-w-[1360px] px-4 sm:px-6">
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#2563EB]/40 dark:border-[#60A5FA]/40 bg-white dark:bg-[#101820] px-4 py-3 text-xs text-[#101820] dark:text-[#F8FAFC] shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>{appNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setAppNotice(null)}
                aria-label="ปิดการแจ้งเตือน"
                className="rounded p-1 hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1">
          {activeTab === 'studio' && (
            <StudioView
              user={user}
              ideaInput={ideaInput}
              onIdeaInputChange={setIdeaInput}
              enhancedPrompt={enhancedPrompt}
              onEnhancedPromptChange={setEnhancedPrompt}
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              stylePreset={stylePreset}
              onStylePresetChange={setStylePreset}
              photorealismPreset={photorealismPreset}
              onPhotorealismPresetChange={setPhotorealismPreset}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              seedValue={seedValue}
              onSeedValueChange={setSeedValue}
              promptMode={promptMode}
              onPromptModeChange={setPromptMode}
              textInImage={textInImage}
              onTextInImageChange={setTextInImage}
              sessionCreations={sessionCreations}
              activeCreation={activeCreation}
              onSelectActiveCreation={setActiveCreation}
              onCreationAdded={(creation) => {
                setSessionCreations((prev) => [creation, ...prev]);
                setActiveCreation(creation);
              }}
              onBatchCreated={(creations) => {
                setSessionCreations((prev) => [...creations, ...prev]);
                if (creations[0]) setActiveCreation(creations[0]);
              }}
              onUpdateSessionCreation={handleUpdateSessionCreation}
              onRemoveSessionCreation={handleRemoveSessionCreation}
              onSaveCreation={handleSaveCreation}
              onSavePromptToCloud={handleSavePromptToCloud}
              onRequireSignIn={handleSignIn}
              onOpenLightbox={setLightboxItem}
              onOpenInEditor={handleOpenInEditor}
              onOpenInDecompose={handleOpenInDecompose}
              onContinuePrompt={handleContinuePrompt}
              autoSaveEnabled={autoSaveEnabled}
              onToggleAutoSave={setAutoSaveEnabled}
              quota={quota}
              onQuotaChange={setQuota}
            />
          )}

          {activeTab === 'decompose' && (
            <LayerDecomposeView
              user={user}
              initialSource={decomposeSource}
              onOpenInEditor={(item) => {
                setMultiEditorSources(undefined);
                setEditorSource(item);
                setActiveTab('editor');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'editor' && (
            <EditorView
              user={user}
              sourceItem={editorSource}
              initialMultiSources={multiEditorSources}
              onSelectSource={setEditorSource}
              onClearMultiSources={() => setMultiEditorSources(undefined)}
              onSaveEditedPngToVault={handleSaveEditedPngToVault}
              onSaveStudioProjectToCloud={handleSaveStudioProjectToCloud}
              onRequireSignIn={handleSignIn}
            />
          )}

          {activeTab === 'video' && <VideoEditorView />}

          {activeTab === 'tools' && (
            <ImageToolsView
              onOpenInProEditor={(item) => {
                setMultiEditorSources(undefined);
                setEditorSource(item);
                setActiveTab('editor');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'vault' && (
            <VaultView
              user={user}
              images={vaultImages}
              albums={albums}
              loading={vaultLoading}
              sessionCreations={sessionCreations}
              onSignIn={handleSignIn}
              onToggleFavorite={async (id, next) => {
                try {
                  await toggleImageFavorite(id, next);
                } catch (err) {
                  setAppNotice(err instanceof Error ? err.message : 'อัปเดตรายการโปรดไม่สำเร็จ');
                }
              }}
              onDeleteImage={async (id) => {
                try {
                  await deleteVaultImage(id);
                } catch (err) {
                  setAppNotice(err instanceof Error ? err.message : 'ลบภาพไม่สำเร็จ');
                }
              }}
              onSyncSessionCreations={handleSyncAllSessionCreations}
              onCreateAlbum={async (name) => {
                if (!user) return;
                await createAlbum(user, name);
              }}
              onRenameAlbum={async (albumId, name) => {
                await renameAlbum(albumId, name);
              }}
              onDeleteAlbum={async (albumId) => {
                await deleteAlbum(albumId);
              }}
              onMoveImagesToAlbum={async (imageIds, albumId) => {
                await moveImagesToAlbum(imageIds, albumId);
              }}
              onOpenLightbox={setLightboxItem}
              onOpenInEditor={handleOpenInEditor}
              onOpenMultipleInEditor={handleOpenMultipleInEditor}
              onContinuePrompt={handleContinuePrompt}
              onGenerateVariation={handleGenerateVariation}
              onGoToStudio={() => setActiveTab('studio')}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              user={user}
              entitlement={entitlement}
              referralHistory={referralHistory}
              recentJobs={recentJobs}
              savedPrompts={savedPrompts}
              studioProjects={studioProjects}
              loading={entitlementLoading}
              onSignIn={handleSignIn}
              onRefreshEntitlement={() => syncEntitlement(user)}
              onClaimReferralCode={handleClaimReferralCode}
              onLoadSavedPrompt={(item) => {
                setIdeaInput(item.prompt);
                setEnhancedPrompt(item.prompt);
                setNegativePrompt(item.negativePrompt || '');
                setStylePreset(item.stylePreset);
                setPhotorealismPreset(
                  (item.photorealismPreset as PhotorealismPresetId) || 'none'
                );
                setAspectRatio(item.aspectRatio);
                setActiveTab('studio');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDeleteSavedPrompt={deleteSavedPrompt}
              onOpenStudioProject={(item) => {
                setMultiEditorSources(undefined);
                setEditorSource({
                  id: item.id,
                  title: item.title,
                  imageUrl: '',
                  originalPrompt: item.title,
                  enhancedPrompt: item.title,
                  stylePreset: 'auto',
                  aspectRatio: '1:1',
                  projectJson: item.projectJson,
                });
                setActiveTab('editor');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDeleteStudioProject={deleteStudioProject}
              onRerunPrompt={(promptText, st, ar) => {
                setIdeaInput(promptText);
                setEnhancedPrompt(promptText);
                if (st) setStylePreset(st);
                if (ar) setAspectRatio(ar);
                setActiveTab('studio');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'showcase' && (
            <ShowcaseView
              featuredImages={featuredImages}
              onOpenLightbox={setLightboxItem}
              onOpenInEditor={handleOpenInEditor}
              onContinuePrompt={handleContinuePrompt}
              onGoToStudio={() => setActiveTab('studio')}
            />
          )}

          {activeTab === 'requests' && <RequestsView user={user} />}

          {activeTab === 'admin' && (
            <AdminView
              user={user}
              isAdmin={isAdmin}
              allImages={adminImages}
              serverArchiveImages={serverArchiveImages}
              members={members}
              firestoreRequests={firestoreRequests}
              serverGuestRequests={serverGuestRequests}
              loadingImages={adminLoadingImages}
              loadingMembers={loadingMembers}
              onRefreshAll={refreshAdminAll}
              onChangeVisibility={async (id: string, vis: ImageVisibility) => {
                try {
                  await updateImageVisibility(id, vis);
                } catch (err) {
                  setAppNotice(err instanceof Error ? err.message : 'อัปเดตสถานะภาพไม่สำเร็จ');
                }
              }}
              onDeleteImage={async (id: string) => {
                try {
                  await deleteVaultImage(id);
                } catch (err) {
                  setAppNotice(err instanceof Error ? err.message : 'ลบภาพไม่สำเร็จ');
                }
              }}
              onDeleteServerArchive={handleDeleteServerArchive}
              onUpdateRequestStatus={handleUpdateRequestStatus}
              onDeleteRequest={handleDeleteRequest}
              onOpenLightbox={setLightboxItem}
              onOpenInEditor={handleOpenInEditor}
            />
          )}
        </main>

        <footer className="mt-8 border-t border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820]">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-[#64748B] dark:text-slate-400 sm:px-6">
            <span>ZImage · แพลตฟอร์มสร้างภาพ AI แยกเลเยอร์ PSD แต่งภาพ และตัดต่อวิดีโอครบวงจร</span>
            <span>ประมวลผลภาพและวิดีโอบนเบราว์เซอร์ฟรีไม่จำกัด · Firebase Cloud Vault</span>
          </div>
        </footer>
      </div>

      <LightboxModal
        item={lightboxItem}
        vaultImages={vaultImages}
        onSelectVaultRecord={(rec) =>
          setLightboxItem({
            id: rec.id,
            imageUrl: rec.imageDataUrl,
            originalPrompt: rec.originalPrompt,
            enhancedPrompt: rec.enhancedPrompt,
            stylePreset: rec.stylePreset,
            aspectRatio: rec.aspectRatio,
            authorName: rec.ownerName,
            itemType: rec.itemType,
            sourceImageId: rec.sourceImageId,
            projectJson: rec.projectJson,
            albumId: rec.albumId,
          })
        }
        onClose={() => setLightboxItem(null)}
        onContinuePrompt={handleContinuePrompt}
        onOpenInEditor={handleOpenInEditor}
      />
    </div>
  );
}
