# Security Specification & Red-Team Audit Plan

## 1. Data Invariants
1. **Identity Integrity**: A `UserProfile` at `/users/{userId}` can only be created or updated by `request.auth.uid == userId` (or a verified admin), with `uid == userId` and verified Google account (`email_verified == true`).
2. **Privilege Isolation**: A non-admin user cannot assign themselves `role: "admin"` on create or update; only verified admin emails (`zbcd1053@gmail.com`, `zeetosit@gmail.com`) with `email_verified == true` hold admin authority.
3. **PII Isolation**: Member emails are stored exclusively in `/users/{userId}/private/info` and are readable only by the document owner (`request.auth.uid == userId`) or a verified admin. No email addresses are stored in `/images/{imageId}` or `/requests/{requestId}`.
4. **Image Ownership & Immutability**: On `/images/{imageId}` creation, `ownerId` must equal `request.auth.uid`, `visibility` must be `'private'` (unless admin), and `createdAt == request.time`. Unauthenticated users cannot write to Firestore `/images`.
5. **Daily Request Quota Invariant**: A `UserRequest` at `/requests/{requestId}` must use deterministic document ID `{uid}_{YYYY-MM-DD}` (`requestId == request.auth.uid + '_' + incoming().dateKey`), enforcing strictly 1 letter per user per day. Initial `status` must be `'submitted'`, `rating` integer `1..5`, and only verified admins can update `status`/`adminNote` or delete requests.
6. **No Blanket Reads or Client Query Delegation**: `allow list` on `/images`, `/savedPrompts`, `/studioProjects`, and `/requests` explicitly evaluates `resource.data` without `get()`/`exists()` calls.
7. **Saved Prompts & Studio Projects Isolation**: `/savedPrompts/{promptId}` and `/studioProjects/{projectId}` strictly verify `ownerId == request.auth.uid`, valid bounded string sizes (`prompt <= 20000`, `projectJson <= 250000`), and immutable `ownerId`/`createdAt`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Self-Admin Escalation on Create**: Regular user creates `/users/{uid}` with `role: "admin"`. -> MUST DENY.
2. **Self-Admin Escalation on Update**: Regular user updates `/users/{uid}` changing `role` to `"admin"`. -> MUST DENY.
3. **Email Spoofing Admin Bypass**: User with `email: "zbcd1053@gmail.com"` and `email_verified: false` tries to list `/users` or `/requests`. -> MUST DENY.
4. **PII Scraping**: Signed-in non-admin user tries `get` on `/users/otherUid/private/info`. -> MUST DENY.
5. **User Directory Scraping**: Signed-in non-admin user tries `list` on `/users`. -> MUST DENY.
6. **Impersonated Image Ownership**: User A creates `/images/img1` with `ownerId: "userB"`. -> MUST DENY.
7. **Unauthorized Showcase Hijack**: Non-admin user creates or updates `/images/img1` with `visibility: "featured"`. -> MUST DENY.
8. **Shadow Ghost Field Injection**: User creates `/images/img1` or `/requests/req1` with extra shadow fields. -> MUST DENY.
9. **Daily Request Quota Bypass**: User attempts to create `/requests/customRandomId` instead of `{uid}_{YYYY-MM-DD}`, or tries to delete today's request to resubmit. -> MUST DENY.
10. **Rating Out-of-Bounds / Status Tampering**: User submits `/requests/{uid}_{date}` with `rating: 99` or `status: "completed"`. -> MUST DENY.
11. **Unauthenticated Vault Save**: Guest tries to write `/images/guest1` directly to Firestore without Google Auth. -> MUST DENY.
12. **Cross-Tenant Image / Request Read**: Regular User A attempts to read or list private images or letters belonging to User B. -> MUST DENY.
