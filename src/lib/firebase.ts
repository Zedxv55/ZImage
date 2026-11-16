import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BLUEPRINT_LIMITS,
  RECRAFT_MODEL,
  isAdminUser,
  validateBlueprintAlbumName,
  validateBlueprintImagePayload,
  validateBlueprintRequestPayload,
} from '../utils/promptLogic';
import type {
  AspectRatioId,
  ImageVisibility,
  RequestStatus,
  StylePresetId,
  VaultItemType,
} from '../utils/promptLogic';
import { convertUrlToPngDataUrl } from '../utils/canvasImageHelper';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface VaultImageRecord {
  id: string;
  ownerId: string;
  userId?: string;
  ownerName: string;
  itemType?: VaultItemType;
  sourceImageId?: string;
  albumId?: string;
  projectJson?: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  model: string;
  imageDataUrl: string;
  isFavorite: boolean;
  visibility: ImageVisibility;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AlbumRecord {
  id: string;
  ownerId: string;
  userId: string;
  name: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MemberRecord {
  uid: string;
  displayName: string;
  photoURL: string;
  role: 'member' | 'admin';
  imageCount: number;
  email?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface RequestRecord {
  id: string;
  authorId: string;
  authorName: string;
  dateKey: string;
  subject: string;
  message: string;
  rating: number;
  status: RequestStatus;
  adminNote: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfile(result.user);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function syncUserProfile(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  const displayName = (user.displayName || user.email?.split('@')[0] || 'ZImage Member').slice(
    0,
    BLUEPRINT_LIMITS.displayNameMax
  );
  const photoURL = (user.photoURL || '').slice(0, 500);
  const role: 'member' | 'admin' = isAdminUser(user.email, user.emailVerified) ? 'admin' : 'member';

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        photoURL,
        role,
        imageCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        photoURL,
        ...(isAdminUser(user.email, user.emailVerified) ? { role: 'admin' } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }

  if (user.email) {
    try {
      const privateSnap = await getDoc(privateRef);
      if (!privateSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: user.email,
          lastLoginAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email: user.email,
          lastLoginAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/private/info`);
    }
  }
}

export async function compressImageForFirestore(
  sourceUrl: string,
  maxChars: number = 640000
): Promise<string> {
  if (sourceUrl.startsWith('data:image/png;base64,') && sourceUrl.length <= maxChars) {
    return sourceUrl;
  }
  return convertUrlToPngDataUrl(sourceUrl, maxChars);
}

export interface SaveImageInput {
  user: User;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  rawImageUrl: string;
  isFavorite?: boolean;
  itemType?: VaultItemType;
  sourceImageId?: string;
  albumId?: string;
  projectJson?: string;
}

export async function saveImageToVault(input: SaveImageInput): Promise<string> {
  if (!input.user) {
    throw new Error('กรุณาเข้าสู่ระบบด้วย Google ก่อนบันทึกภาพเข้าคลังส่วนตัว');
  }
  await syncUserProfile(input.user);
  const maxDataUrlChars = input.projectJson ? 560000 : 640000;
  const compressedUrl = await compressImageForFirestore(input.rawImageUrl, maxDataUrlChars);
  const ownerName = (
    input.user.displayName ||
    input.user.email?.split('@')[0] ||
    'ZImage Member'
  ).slice(0, BLUEPRINT_LIMITS.displayNameMax);

  const originalPrompt = input.originalPrompt.trim().slice(0, BLUEPRINT_LIMITS.originalPromptMax);
  const enhancedPrompt = input.enhancedPrompt.trim().slice(0, BLUEPRINT_LIMITS.enhancedPromptMax);
  const dimensionsLabel = input.dimensionsLabel
    ? input.dimensionsLabel.trim().slice(0, BLUEPRINT_LIMITS.dimensionsLabelMax)
    : undefined;
  const itemType: VaultItemType = input.itemType || 'generated';
  const sourceImageId = input.sourceImageId ? input.sourceImageId.trim().slice(0, 128) : undefined;
  const albumId = input.albumId ? input.albumId.trim().slice(0, 128) : undefined;
  const projectJson =
    input.projectJson && input.projectJson.length <= BLUEPRINT_LIMITS.projectJsonMax
      ? input.projectJson
      : undefined;

  const check = validateBlueprintImagePayload({
    originalPrompt,
    enhancedPrompt,
    stylePreset: input.stylePreset,
    aspectRatio: input.aspectRatio,
    dimensionsLabel,
    imageDataUrl: compressedUrl,
    itemType,
    sourceImageId,
    albumId,
    projectJson,
  });

  if (!check.valid) {
    throw new Error(check.reason || 'ข้อมูลภาพไม่ตรงตามโครงสร้างฐานข้อมูล');
  }

  const imagesCol = 'images';
  try {
    const docRef = await addDoc(collection(db, imagesCol), {
      ownerId: input.user.uid,
      userId: input.user.uid,
      ownerName,
      itemType,
      ...(sourceImageId ? { sourceImageId } : {}),
      ...(albumId ? { albumId } : {}),
      ...(projectJson ? { projectJson } : {}),
      originalPrompt,
      enhancedPrompt,
      stylePreset: input.stylePreset,
      aspectRatio: input.aspectRatio,
      ...(dimensionsLabel ? { dimensionsLabel } : {}),
      model: RECRAFT_MODEL,
      imageDataUrl: compressedUrl,
      isFavorite: Boolean(input.isFavorite),
      visibility: 'private',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await updateDoc(doc(db, 'users', input.user.uid), {
        imageCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal counter increment failure
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, imagesCol);
  }
}

export async function toggleImageFavorite(imageId: string, nextValue: boolean): Promise<void> {
  const path = `images/${imageId}`;
  try {
    await updateDoc(doc(db, 'images', imageId), {
      isFavorite: nextValue,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateVaultImageAlbum(imageId: string, albumId: string): Promise<void> {
  const path = `images/${imageId}`;
  try {
    await updateDoc(doc(db, 'images', imageId), {
      albumId: albumId.trim().slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function moveImagesToAlbum(imageIds: string[], albumId: string): Promise<void> {
  for (const id of imageIds) {
    await updateVaultImageAlbum(id, albumId);
  }
}

export async function updateImageVisibility(
  imageId: string,
  visibility: ImageVisibility
): Promise<void> {
  const path = `images/${imageId}`;
  try {
    await updateDoc(doc(db, 'images', imageId), {
      visibility,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVaultImage(imageId: string): Promise<void> {
  const path = `images/${imageId}`;
  try {
    await deleteDoc(doc(db, 'images', imageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserAlbums(
  userId: string,
  onData: (items: AlbumRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'albums'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AlbumRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AlbumRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'albums');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createAlbum(user: User, name: string): Promise<string> {
  if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนสร้างอัลบั้ม');
  await syncUserProfile(user);
  const cleanName = name.trim().slice(0, BLUEPRINT_LIMITS.albumNameMax);
  const check = validateBlueprintAlbumName(cleanName);
  if (!check.valid) throw new Error(check.reason || 'ชื่ออัลบั้มไม่ถูกต้อง');

  try {
    const docRef = await addDoc(collection(db, 'albums'), {
      ownerId: user.uid,
      userId: user.uid,
      name: cleanName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'albums');
  }
}

export async function renameAlbum(albumId: string, name: string): Promise<void> {
  const cleanName = name.trim().slice(0, BLUEPRINT_LIMITS.albumNameMax);
  const check = validateBlueprintAlbumName(cleanName);
  if (!check.valid) throw new Error(check.reason || 'ชื่ออัลบั้มไม่ถูกต้อง');

  const path = `albums/${albumId}`;
  try {
    await updateDoc(doc(db, 'albums', albumId), {
      name: cleanName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const path = `albums/${albumId}`;
  try {
    await deleteDoc(doc(db, 'albums', albumId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserVault(
  userId: string,
  onData: (items: VaultImageRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'images'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: VaultImageRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<VaultImageRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'images');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeToFeaturedShowcase(
  onData: (items: VaultImageRecord[]) => void
) {
  const q = query(
    collection(db, 'images'),
    where('visibility', '==', 'featured'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: VaultImageRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<VaultImageRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      console.warn('Featured showcase listener warning:', error.message);
    }
  );
}

export function subscribeToAllImagesAdmin(
  onData: (items: VaultImageRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'images'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: VaultImageRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<VaultImageRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'images');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function fetchAllMembersAdmin(): Promise<MemberRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('updatedAt', 'desc')));
    const members = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as Omit<MemberRecord, 'email'>;
        let email = '';
        try {
          const privSnap = await getDoc(doc(db, 'users', d.id, 'private', 'info'));
          if (privSnap.exists()) {
            email = String(privSnap.data().email || '');
          }
        } catch {
          email = '';
        }
        return {
          ...data,
          uid: d.id,
          email,
        };
      })
    );
    return members;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

/* ============================================================================
 * Daily Feature Requests / Letters to Staff (/requests)
 * ============================================================================ */

export function getTodayDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchTodayUserRequest(userId: string): Promise<RequestRecord | null> {
  const dateKey = getTodayDateKey();
  const requestId = `${userId}_${dateKey}`;
  const path = `requests/${requestId}`;
  try {
    const snap = await getDoc(doc(db, 'requests', requestId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<RequestRecord, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function submitDailyRequest(input: {
  user: User;
  subject: string;
  message: string;
  rating: number;
}): Promise<RequestRecord> {
  const dateKey = getTodayDateKey();
  const subject = input.subject.trim().slice(0, BLUEPRINT_LIMITS.requestSubjectMax);
  const message = input.message.trim().slice(0, BLUEPRINT_LIMITS.requestMessageMax);
  const rating = Math.round(input.rating);

  const check = validateBlueprintRequestPayload({ subject, message, rating, dateKey });
  if (!check.valid) {
    throw new Error(check.reason || 'ข้อมูลคำขอไม่ถูกต้อง');
  }

  const requestId = `${input.user.uid}_${dateKey}`;
  const path = `requests/${requestId}`;
  const authorName = (
    input.user.displayName ||
    input.user.email?.split('@')[0] ||
    'ZImage Member'
  ).slice(0, BLUEPRINT_LIMITS.displayNameMax);

  try {
    const existing = await getDoc(doc(db, 'requests', requestId));
    if (existing.exists()) {
      throw new Error('วันนี้คุณได้ส่งจดหมายคำขอถึงเจ้าหน้าที่ไปแล้ว (ส่งได้วันละ 1 ครั้ง)');
    }

    await setDoc(doc(db, 'requests', requestId), {
      authorId: input.user.uid,
      authorName,
      dateKey,
      subject,
      message,
      rating,
      status: 'submitted',
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const created = await getDoc(doc(db, 'requests', requestId));
    return {
      id: created.id,
      ...(created.data() as Omit<RequestRecord, 'id'>),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('ส่งได้วันละ 1 ครั้ง')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToMyRequests(
  userId: string,
  onData: (items: RequestRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'requests'),
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: RequestRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RequestRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeToAllRequestsAdmin(
  onData: (items: RequestRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: RequestRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RequestRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function updateRequestStatusAdmin(
  requestId: string,
  status: RequestStatus,
  adminNote: string
): Promise<void> {
  const path = `requests/${requestId}`;
  try {
    await updateDoc(doc(db, 'requests', requestId), {
      status,
      adminNote: adminNote.trim().slice(0, BLUEPRINT_LIMITS.requestAdminNoteMax),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRequestAdmin(requestId: string): Promise<void> {
  const path = `requests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'requests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ============================================================================
 * Saved Unlimited Prompts (/savedPrompts) & Studio Projects (/studioProjects)
 * ============================================================================ */

export interface SavedPromptRecord {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  stylePreset: StylePresetId;
  photorealismPreset?: string;
  aspectRatio: AspectRatioId;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface StudioProjectRecord {
  id: string;
  ownerId: string;
  title: string;
  kind: 'editor' | 'decompose' | 'video';
  projectJson: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export async function savePromptToFirestore(input: {
  user: User;
  title: string;
  prompt: string;
  negativePrompt?: string;
  stylePreset: StylePresetId;
  photorealismPreset?: string;
  aspectRatio: AspectRatioId;
}): Promise<string> {
  await syncUserProfile(input.user);
  const title = input.title.trim().slice(0, 120) || 'Saved Prompt';
  const prompt = input.prompt.trim().slice(0, BLUEPRINT_LIMITS.originalPromptMax);
  if (!prompt) throw new Error('กรุณาระบุข้อความพรอมต์ก่อนบันทึก');

  try {
    const ref = await addDoc(collection(db, 'savedPrompts'), {
      ownerId: input.user.uid,
      title,
      prompt,
      ...(input.negativePrompt?.trim()
        ? { negativePrompt: input.negativePrompt.trim().slice(0, 4000) }
        : {}),
      stylePreset: input.stylePreset,
      ...(input.photorealismPreset ? { photorealismPreset: input.photorealismPreset.slice(0, 64) } : {}),
      aspectRatio: input.aspectRatio,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'savedPrompts');
  }
}

export function subscribeToSavedPrompts(
  userId: string,
  onData: (items: SavedPromptRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'savedPrompts'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SavedPromptRecord, 'id'>),
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'savedPrompts');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function deleteSavedPrompt(promptId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'savedPrompts', promptId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `savedPrompts/${promptId}`);
  }
}

export async function saveStudioProjectToFirestore(input: {
  user: User;
  title: string;
  kind: 'editor' | 'decompose' | 'video';
  projectJson: string;
}): Promise<string> {
  await syncUserProfile(input.user);
  const title = input.title.trim().slice(0, 120) || 'ZImage Project';
  if (input.projectJson.length > BLUEPRINT_LIMITS.projectJsonMax) {
    throw new Error('ขนาดข้อมูลโปรเจกต์เกินขีดจำกัดฐานข้อมูล (250KB)');
  }
  try {
    const ref = await addDoc(collection(db, 'studioProjects'), {
      ownerId: input.user.uid,
      title,
      kind: input.kind,
      projectJson: input.projectJson,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'studioProjects');
  }
}

export function subscribeToStudioProjects(
  userId: string,
  onData: (items: StudioProjectRecord[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'studioProjects'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StudioProjectRecord, 'id'>),
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'studioProjects');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function deleteStudioProject(projectId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'studioProjects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `studioProjects/${projectId}`);
  }
}

