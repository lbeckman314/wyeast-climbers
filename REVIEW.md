# Morning review checklist

This draft was built overnight from published sources. Everything below needs a human look.

## 1. Facts that need checking against Conrad's book

Restored with a source: the **1934 club cabin** is back on the timeline, sourced to the Mount Hood Museum's guide to the Skisterical map. Still worth checking against Conrad: who built it and exactly where it stood.

Removed from the site because they have no source yet (recover them from git history once sourced):
- **Oct 4, 1931 "Dog Rescues Six"**: were Wy'easters in the party?
- **May 2, 1937 ski circuit** by Leuthold & Darr: came from a search-engine summary of notes on Grauer's book. The page itself was down.
- **1942 "end of an era"**: what actually happened to the club after 1942? *Biggest open question.*

Shown with a **Sources disagree** badge:
- **Founding date**: Dec 1930 (Conrad, Grauer) vs 1931 (PNWSAR, with the Multnomah Falls Lodge restroom story).
- **Eliot Glacier Headwall**: 1938 (two sources) vs 1935 (Mountain Project).

Missing dates (in the "Not yet dated" section): the Leuthold Couloir first ascent, the Wy'east Route first climb (Darr, Mount, Calkin), the illuminations, and the reopened routes.

Membership marked "to confirm": Joe Leuthold, Ralph Calkin, Jim Mount, Jim Harlow.

Also worth checking:
- Wording about the name *Wy'east* (in `exhibits/founding.md`). I kept it deliberately cautious, because the name's origin is debated.
- Whether Bill Hackett (North Face, 1936) was a Wy'easter.

## 2. Things only you can decide
- **Site author and repository**: set `author.name` in `src/config.ts` (it goes into the page's author meta tag). The About section's Contribute button links to `repo` there.
- **Site voice and "we"**: the copy speaks as "we" (the project). Who is behind it publicly?
- **Draft banner**: remove from `src/layouts/Base.astro` when you're ready.
- **Separate repo vs. subfolder**: see README → Deploying.

## 3. Outreach (permissions & collaboration)
- **Ric Conrad / Kahuna Books**: introduce the project, ask for fact-checking help, and ask about using his research and illustrations (Lon Haverly's charcoal drawings).
- **Mazama Library & Historical Collections**: holds the Leuthold, Harlow, Henderson and Onthank photographs referenced on the Ranger exhibit, plus the summit registers.
- **Oregon Historical Society**: newspaper archives and photo licensing.
- **Mt. Hood Ski Patrol**: 1937–38 photos and records.
- **Mount Hood Museum**: Ranger material; they sell Conrad's book.
- **Ned Thanhouser / Jeff Thomas**: the Ranger documentary.
- **Families of Hank Lewis, Lu Norene, Russ McJury, Randall Kester, the Darrs**: letters, photos, the *Wy'east Bulletin*.

Keep a permissions log, either a simple spreadsheet or a `permissions.yaml` here, with: image, holder, date asked, terms, credit line.

## 4. Ideas for next passes
- Route map of Mount Hood (SVG or Leaflet) showing the club's first ascents and reopened routes.
- An exhibit on Ida Darr and women climbers of the 1930s.
- Profiles for the "outlaws" (Gary Leech, Smoke Blanchard, Hubert North).
- An exhibit on the Nile River Yacht Club.
- Oral history page: transcripts or audio, with permission.
- Search (Pagefind, same as your personal site).
