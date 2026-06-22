## Plan: Replace logo with uploaded book-stack image

1. Upload the attached image to Lovable Assets CDN via `lovable-assets create` from `/mnt/user-uploads/image.png`, writing the pointer to `src/assets/logo-icon.png.asset.json`.
2. Remove the old `public/logo-icon.png`.
3. Find every reference to the current logo (`public/logo-icon.png`, favicon in `index.html`, nav usage in `src/components/AppSidebar.tsx`, `src/components/AppLayout.tsx`, and `src/pages/Landing.tsx`) and swap them to import the new asset pointer.
4. Update `index.html` favicon + og:image to point at the new CDN URL.
5. Verify visually in the preview (sidebar, landing nav, browser tab favicon).

No other UI/behavior changes.