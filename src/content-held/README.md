# Held back: Everett Darr

Everett Darr is temporarily off the site until his role is corroborated (see the Research desk note on
`1937-first-patroller`: a correction credits Hank Lewis, not Darr, with pushing for mountain rescue and the ski patrol).
Everything that rested only on his *American Alpine Journal* obituary is held back too: the Wy'east Route's
first-ascent credit (and the route on the map), James Mount's profile, and that part of Ralph Calkin's.
Nothing in this folder is built; the content loaders only read `src/content/`.

## To restore

1. Move `people/everett-darr.md`, `people/james-mount.md`, `milestones/1981-darr-dies.md` and
   `milestones/undated-wyeast-route.md` back into `src/content/` (same subfolders).
2. Put the obituary back in `src/content/sources.yaml` and the Wy'east Route back in
   `src/data/routes.ts` (both below). The 3D model draws only routes listed there.
3. Put back the wording below (each change shows the original, then what it says now), adjusting it to whatever the sources show.

- `src/content/people/ida-darr.md`
  - was: with her husband Everett, founded Portland's Mountain Shop
  - now: with her husband, founded Portland's Mountain Shop
- `src/content/people/ida-darr.md`
  - was: a stronger climber and organizer than Everett;
  - now: a stronger climber and organizer than her husband;
- `src/content/people/barney-macnab.md`
  - was: credits Macnab and Wy'east president Everett Darr with persuading
  - now: credits Macnab and the Wy'east Climbers' president with persuading
- `src/content/people/ralph-calkin.md`
  - was: Ralph Calkin is credited with Everett Darr and James Mount on the first climb of Mount Hood's **Wy'east Route**.
  - now: Ralph Calkin is credited, with James Mount, as one of the three climbers who made the first climb of Mount Hood's **Wy'east Route**.
- `src/content/people/james-mount.md`
  - was: Named in Everett Darr's obituary as one of the three climbers, with Darr and Ralph Calkin, who made the first climb
  - now: Named in a 1982 *American Alpine Journal* obituary as one of the three climbers, with Ralph Calkin, who made the first climb
- `src/content/milestones/1937-mountain-shop.md`
  - was: title: Everett and Ida Darr open the Mountain Shop
  - now: title: Ida Darr and her husband open the Mountain Shop
- `src/content/milestones/1937-mountain-shop.md`
  - was: people: [everett-darr, ida-darr]
  - now: people: [ida-darr]
- `src/content/milestones/1937-mountain-shop.md`
  - was: The Darrs opened a climbing and ski shop on NE Broadway in Portland. Everett Darr later kept a Mountain Shop in Government Camp.
  - now: The Darrs opened a climbing and ski shop on NE Broadway in Portland, and later kept a Mountain Shop in Government Camp.
- `src/content/milestones/1937-first-patroller.md`
  - was: people: [hank-lewis, barney-macnab, everett-darr]
  - now: people: [hank-lewis, barney-macnab]
- `src/content/milestones/1937-first-patroller.md`
  - was: The patrol's history credits Wy'east president Everett Darr and Barney Macnab, captain of the Nile River Yacht Club, with pressing the Forest Service to act.
  - now: The patrol's history credits Barney Macnab, captain of the Nile River Yacht Club, and the Wy'east Climbers' president with pressing the Forest Service to act.
- `src/content/milestones/1937-first-patroller.md`
  - was: *To verify:* a correction we've received says it was Hank Lewis, not Everett Darr, who pushed for mountain rescue and the ski patrol, and that Darr became a prominent figure only later, after he opened his shop in Government Camp. The patrol's own history credits Darr and Macnab; Ric Conrad's book should settle it.
  - now: *To verify:* who pushed for mountain rescue and the ski patrol. A correction we've received credits Hank Lewis; the patrol's own history credits Macnab and the club's president. Ric Conrad's book should settle it.
- `src/content/milestones/undated-wyeast-route.md`
  - was: people: [everett-darr, james-mount, ralph-calkin]
  - now: people: [james-mount, ralph-calkin]
- `src/content/milestones/undated-wyeast-route.md`
  - was: Everett Darr's obituary in the *American Alpine Journal* credits him, James Mount and Ralph Calkin with the first climb
  - now: A 1982 obituary in the *American Alpine Journal* credits James Mount, Ralph Calkin and a third Wy'east Climber with the first climb
- `src/data/routes.ts`
  - was: summary: "Everett Darr, James Mount & Ralph Calkin."
  - now: summary: "James Mount, Ralph Calkin & a third Wy'easter."
- `src/data/landmarks.json`
  - was: After a 1950 fire, Everett Darr and Carl Reynolds built a lodge and lifts there as the Multorpor Ski Area.
  - now: After a 1950 fire, a lodge and lifts were built there as the Multorpor Ski Area.

- `src/content/people/ralph-calkin.md`
  - was: sources: [aac-darr-1982, ranger-mhh]
  - now: sources: [ranger-mhh]
- `src/content/people/ralph-calkin.md`
  - was: Ralph Calkin is credited, with James Mount, as one of the three climbers who made the first climb of Mount Hood's **Wy'east Route**. He carried
  - now: Ralph Calkin carried

### `src/content/sources.yaml`

```yaml
- id: aac-darr-1982
  title: "Everett L. Darr, 1907–1981 (In Memoriam)"
  publisher: American Alpine Journal
  year: 1982
  url: https://publications.americanalpineclub.org/articles/12198233800/Everett-L-Darr-1907-1981
  kind: article
```

### `src/data/routes.ts` (after the Newton-Clark Headwall)

```ts
  { id: "wyeast", name: "Wy'east Route", bearing: 135, kind: "first-ascent", summary: "James Mount, Ralph Calkin & a third Wy'easter.", milestone: "undated-wyeast-route" },
```
