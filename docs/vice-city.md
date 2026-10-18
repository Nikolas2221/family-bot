# KLAIZ Vice City Edition

Release 1.5.0 introduces generated artwork for update announcements in Discord and
Telegram. It does not restyle application/moderation cards or technical logs yet.
Jason and Lucia appear in the reusable fan-art banner at assets/vice-city/banner.png.
The banner was created with the built-in image generator from the approved mockup;
it is not an official Rockstar asset.

Artwork uses real semver, build ID and nonempty release-note groups. Version text is
rendered by code, not baked into the banner. The normal changelog remains accessible
as Discord fields / Telegram text, even if image generation is unavailable.

The renderer uses the project's existing Playwright/Chromium installation. There
are no new packages or external image-hosting requirements. No network resources
are loaded while rendering. The shared renderer serializes browser work, closes
the browser after each render, and caches up to eight variants per process.

Generated Vice City artwork takes precedence over old update-card image URLs,
UPDATE_CARD_BANNER_URL and the generic family banner. Stored URLs are not deleted;
they are simply ignored for update announcements with the renderer configured.
If rendering fails or Discord lacks Attach Files, updates fall back to text, not
the old banner. Other card categories retain their custom images unchanged.
UPDATE_CARD_TITLE and UPDATE_CARD_COLOR continue to override Discord defaults.
Custom title/footer/color are rendered into the artwork.

Discord requires Attach Files for artwork. Without it, the normal text embed is
sent. Network delivery errors are not proof that a message was not delivered;
do not repeatedly redeploy to force duplicate announcements.

Only documented Release commits announce updates. Fix commits remain silent. No
announcement is sent by the local preview workflow. Publish using a commit message
starting with Release 1.5.0, and the existing per-version deduplication remains active.

Image prompt: reuse the approved pink/cyan KLAIZ Vice City sunset waterfront banner,
add Jason Duval and Lucia Caminos beside a sports car, preserve readable KLAIZ and
Vice City Edition branding, and keep all version/changelog text out of the bitmap.
