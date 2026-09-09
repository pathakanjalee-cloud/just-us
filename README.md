# Just Us

A tiny, invite-only two-person room with live chat and multiplayer games.

## Included
- Shareable room links
- Supabase Realtime Presence
- Live chat
- Tic Tac Toe
- Rock Paper Scissors
- Mobile-friendly design
- No login required

## Deploy
This is a static site. Upload the contents of this folder to Vercel Drop.

The Supabase Project URL and Publishable key are already configured in `app.js`. The publishable key is intended for browser use; do not put a Supabase secret/service-role key into this file.

## Important
Realtime uses Supabase Broadcast/Presence, so no database table or SQL migration is required for this version.
