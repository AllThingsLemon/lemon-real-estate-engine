// Content collections. Every file lives in the client repo; the engine only
// defines the shape. Keep schemas lenient: anything a client can leave blank
// must be optional or have a default, or a save will fail the build.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { pathToFileURL } from 'node:url';
import { clientDir } from './lib/client-dir.mjs';

const base = (dir: string) => pathToFileURL(`${clientDir}/content/${dir}/`);

const text = z.string().optional().default('');
const link = z.object({ label: text, url: text });

const general = defineCollection({
  loader: glob({ pattern: 'general.json', base: base('settings') }),
  schema: z.object({
    siteName: z.string().default('My Site'),
    description: text,
    logo: text,
    logoHeight: z.number().optional().default(40),
    favicon: text,
    ogImage: text,
    theme: z
      .object({
        accent: z.string().default('#facc15'),
        text: z.string().default('#111827'),
        background: z.string().default('#f9fafb'),
        surface: z.string().default('#ffffff'),
        footer: z.string().default('#111827'),
        font: z.string().default('Poppins'),
        headingFont: text,
      })
      .default({}),
    nav: z.array(link).default([]),
    footer: z
      .object({
        noticeTitle: text,
        noticeText: text,
        links: z.array(link).default([]),
        copyright: text,
      })
      .default({}),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: 'home.json', base: base('settings') }),
  schema: z.object({
    hero: z
      .object({
        title: text,
        text: text,
        image: text,
        imageAlt: text,
        categoriesLabel: text,
      })
      .default({}),
    listings: z.object({ heading: text, emptyText: text }).default({}),
    faq: z
      .object({
        heading: text,
        items: z.array(z.object({ question: text, answer: text })).default([]),
      })
      .default({}),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: base('categories') }),
  schema: z.object({
    name: z.string(),
    icon: text,
    order: z.number().optional().default(100),
  }),
});

const listings = defineCollection({
  loader: glob({ pattern: '**/*.md', base: base('listings') }),
  schema: z.object({
    title: z.string(),
    label: text, // small heading on the card, e.g. "Real Estate Airbnb"
    category: text, // category file name (relation)
    verified: z.boolean().optional().default(false),
    summary: text,
    image: text, // square card image
    banner: text, // wide image on the detail page
    logo: text, // small square image overlapping the banner
    byline: text,
    launchDate: z.coerce.date().optional(),
    linkUrl: text,
    linkLabel: text,
    stats: z
      .array(z.object({ label: text, value: text, onCard: z.boolean().optional().default(false) }))
      .default([]),
    order: z.number().optional().default(100),
    hidden: z.boolean().optional().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: base('pages') }),
  schema: z.object({
    title: z.string(),
    description: text,
    hidden: z.boolean().optional().default(false),
  }),
});

export const collections = { general, home, categories, listings, pages };
