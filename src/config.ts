/**
 * Site-wide settings. Change these here rather than in the pages.
 */
export const site = {
  title: "Wy'east Climbers",
  tagline: "A Living History",
  url: "https://wyeastclimbers.com",

  /**
   * Who runs the site. The contact button reads "Email {name}" and writes to `email`.
   * Leave `name` empty to show the address itself ("Email hello@…").
   * The name also goes into the page's <meta name="author">.
   */
  author: {
    name: "",
    email: "hello@wyeastclimbers.com",
  },
};

/** Text for the contact button: the author's name if set, otherwise the address. */
export const contactLabel = () => `Email ${site.author.name || site.author.email}`;

/** mailto: link to the author, with a subject line filled in. */
export const contactHref = (subject = "Wy'east Climbers history") =>
  `mailto:${site.author.email}?subject=${encodeURIComponent(subject)}`;
