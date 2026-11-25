BUILDTRACK STEP 5 - INVITATION EMAIL HELPER FIX

Issue: deliverInvitation(data) used undefined variable `invitation` on two lines.
Fix: use data.id and data.email in the invitation URL and sendAuthEmail.

To apply on Windows:
1. Back up your existing file:
   Copy-Item .\src\server\auth\invitations.ts .\src\server\auth\invitations.ts.bak
2. Copy the corrected src/server/auth/invitations.ts from this zip to the SAME path inside your BuildTrack project.
3. Run npm run typecheck after npm install and db:generate.

No database migration or other source files are changed by this fix.
