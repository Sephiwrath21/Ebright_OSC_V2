// Ambient declaration for `web-push` (ported CRM push helpers use it). The
// package ships no bundled types, so without this TS7016s the CRM's push.ts /
// webpush.ts. A permissive `any` module matches the runtime behaviour; swap
// for @types/web-push later if stricter typing is wanted.
declare module 'web-push';
