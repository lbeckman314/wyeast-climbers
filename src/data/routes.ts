import type { CardImage } from "../card-images";

/**
 * Routes shown on the schematic map. Bearings are approximate compass
 * directions (degrees clockwise from north) of each route's aspect on the
 * mountain. This is a diagram, not a survey: check bearings before relying on them.
 */
export interface Route {
  id: string;
  name: string;
  bearing: number;
  kind: "first-ascent" | "reopened" | "standard";
  summary: string;
  /** milestone id on the timeline */
  milestone?: string;
  /** optional photo for the route's card on the map (see src/card-images.ts) */
  image?: CardImage;
}

export const routes: Route[] = [
  { id: "north-face", name: "North Face", bearing: 355, kind: "first-ascent", summary: "Russ McJury & Bill Hackett, 1936.", milestone: "1936-north-face",
    image: {"file": "north-face-aerial-2022.jpg", "alt": "The north face of Mount Hood seen from an airplane, 2022", "credit": "DJ Cane", "license": "CC BY-SA 4.0", "url": "https://commons.wikimedia.org/wiki/File:Mount_Hood_from_plane_2022.jpeg"} },
  { id: "eliot", name: "Eliot Glacier Headwall", bearing: 30, kind: "first-ascent", summary: "Russ McJury & Joe Leuthold, 1938 (or 1935).", milestone: "1938-eliot-headwall",
    image: {"file": "eliot-northeast-face-1973.jpg", "alt": "The northeast face of Mount Hood, with the Eliot, Coe and Ladd glaciers, above the Hood River Valley in May 1973", "credit": "David Falconer", "license": "Public domain", "url": "https://commons.wikimedia.org/wiki/File:HOOD_RIVER_VALLEY_AND_THE_NORTHEAST_FACE_OF_MT._HOOD_SHOWING_THE_ELIOT,_COE,_AND_LADD_GLACIERS_-_NARA_-_548095.jpg"} },
  { id: "newton-clark", name: "Newton-Clark Headwall", bearing: 100, kind: "reopened", summary: "Reopened by the Wy'easters after years of disuse.", milestone: "undated-reopened-routes" },
  { id: "wyeast", name: "Wy'east Route", bearing: 135, kind: "first-ascent", summary: "James Mount, Ralph Calkin & a third Wy'easter.", milestone: "undated-wyeast-route" },
  { id: "south-side", name: "South Side", bearing: 180, kind: "standard", summary: "The standard route from Timberline, used by most parties in the 1930s.",
    image: {"file": "south-side-landmarks.jpg", "alt": "Landmarks along Mount Hood's south side climbing route, labeled: Crater Rock, the Hogsback, the Pearly Gates, the bergschrund and the summit", "credit": "U.S. Forest Service", "license": "Public domain", "url": "https://commons.wikimedia.org/wiki/File:Mount_Hood_Landmarks.jpg"} },
  { id: "leuthold", name: "Leuthold Couloir", bearing: 232, kind: "first-ascent", summary: "First ascent credited to the Wy'east Climbers; date to be confirmed.", milestone: "undated-leuthold-couloir",
    image: {"file": "reid-glacier-illumination-rock.jpg", "alt": "The Reid Glacier with Illumination Rock on the skyline, on the side of the mountain the Leuthold Couloir climbs, 2017", "credit": "Walter Siegmund", "license": "CC BY-SA 4.0", "url": "https://commons.wikimedia.org/wiki/File:Reid_Glacier_(Oregon)_2618.JPG"} },
  { id: "sandy", name: "Sandy Glacier Headwall", bearing: 268, kind: "first-ascent", summary: "Russ McJury & Joe Leuthold, 1937.", milestone: "1937-sandy-headwall",
    image: {"file": "sandy-glacier-2017.jpg", "alt": "Mount Hood's west side with the Sandy Glacier at center and Illumination Rock on the right skyline, 2017", "credit": "Walter Siegmund", "license": "CC BY-SA 4.0", "url": "https://commons.wikimedia.org/wiki/File:Mount_Hood_2619s.jpg"} },
  { id: "cathedral", name: "Cathedral Ridge", bearing: 312, kind: "reopened", summary: "Reopened by the Wy'easters after years of disuse.", milestone: "undated-reopened-routes" },
];

export const kindLabels = {
  "first-ascent": "Wy'east-era first ascent",
  reopened: "Reopened by the club",
  standard: "Standard route (for reference)",
} as const;
