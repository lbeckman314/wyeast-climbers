/**
 * Photos on the map's route and landmark cards.
 *
 * Add one by putting the file in src/assets/cards/ and giving the route (src/data/routes.ts) or
 * landmark (src/data/landmarks.json) an `image`. The build fails unless every image is either:
 *   - freely licensed: `license` is public domain, CC0, CC BY or CC BY-SA (with a version), or
 *   - used with permission: `permission` names an entry in src/content/permissions.yaml whose
 *     status is "granted".
 * Either way it needs alt text and a credit line, which the card shows under the photo.
 */
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

export interface CardImage {
  /** file name in src/assets/cards/ */
  file: string;
  /** what the photo shows, for screen readers */
  alt: string;
  /** shown under the photo, e.g. "U.S. Forest Service, via Wikimedia Commons" */
  credit: string;
  /** e.g. "Public domain", "CC BY-SA 4.0" */
  license?: string;
  /** where the photo comes from (its Commons page, archive record, …) */
  url?: string;
  /** id in permissions.yaml, for photos used with the holder's permission */
  permission?: string;
}

export interface CardImageOut {
  src: string;
  alt: string;
  credit: string;
  license: string;
  url?: string;
}

const FREE_LICENSE = /^(public domain|cc0( 1\.0)?|cc by(-sa)? \d(\.\d)?)$/i;

const files = import.meta.glob<{ default: ImageMetadata }>("./assets/cards/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG}", { eager: true });

/** Check an image's license or permission and make a card-sized WebP of it. */
export async function cardImage(
  owner: string,
  img: CardImage | undefined,
  granted: (permissionId: string) => boolean,
): Promise<CardImageOut | undefined> {
  if (!img) return undefined;
  const entry = files[`./assets/cards/${img.file}`];
  if (!entry) throw new Error(`Card image for "${owner}": src/assets/cards/${img.file} not found`);
  if (!img.alt?.trim() || !img.credit?.trim()) throw new Error(`Card image for "${owner}" needs alt text and a credit line`);
  const free = !!img.license && FREE_LICENSE.test(img.license.trim());
  const permitted = !!img.permission && granted(img.permission);
  if (!free && !permitted) {
    throw new Error(
      `Card image for "${owner}" (${img.file}) can't be published: it needs a free license ` +
        `(public domain, CC0, CC BY, CC BY-SA) or a permissions.yaml entry marked "granted".`,
    );
  }
  const out = await getImage({ src: entry.default, width: 720, format: "webp", quality: 78 });
  return {
    src: out.src,
    alt: img.alt,
    credit: img.credit,
    license: free ? img.license! : "Used with permission",
    url: img.url,
  };
}
