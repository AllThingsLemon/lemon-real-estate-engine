// Builds the Sveltia CMS config for one client. Field definitions live here
// (shared by every site); per-client values come from the client repo:
//   site.config.json            repo, branch, siteUrl, authUrl (Jesse-only)
//   content/settings/publishing.json   publish mode (client can switch it in the CMS)
// Paths are relative to the client repo root, which is what the CMS commits to.
import { readClientConfig, readClientJson } from '../lib/client-dir.mjs';

export const PUBLISH_MODES = ['simple', 'preview', 'editorial_workflow'];

const str = (name, label, extra = {}) => ({ name, label, widget: 'string', required: false, ...extra });
const txt = (name, label, extra = {}) => ({ name, label, widget: 'text', required: false, ...extra });
const img = (name, label, extra = {}) => ({ name, label, widget: 'image', required: false, ...extra });
const bool = (name, label, extra = {}) => ({ name, label, widget: 'boolean', required: false, default: false, ...extra });
const color = (name, label, def) => ({ name, label, widget: 'color', required: false, default: def });
const linkList = (name, label, hint) => ({
  name, label, hint, widget: 'list', required: false,
  summary: '{{fields.label}} → {{fields.url}}',
  fields: [str('label', 'Text', { required: true }), str('url', 'Link', { required: true, hint: 'A page like /about or a full web address' })],
});

export function buildCmsConfig() {
  const site = readClientConfig();
  const general = readClientJson('content/settings/general.json');
  const publishing = readClientJson('content/settings/publishing.json');
  const mode = PUBLISH_MODES.includes(publishing.mode) ? publishing.mode : 'simple';

  const backend = { name: 'github', repo: site.repo || 'OWNER/REPO', branch: site.branch };
  if (site.authUrl) backend.base_url = site.authUrl;

  return {
    backend,
    publish_mode: mode,
    site_url: site.siteUrl || undefined,
    app_title: `${general.siteName || 'Site'} · Editor`,
    logo: general.favicon || general.logo ? { src: general.favicon || general.logo } : undefined,
    media_folder: 'public/uploads',
    public_folder: '/uploads',
    media_libraries: {
      default: {
        config: {
          max_file_size: 15_000_000,
          slugify_filename: true,
          // Resize and convert photos in the browser before they're committed.
          transformations: { raster_image: { format: 'webp', quality: 85, width: 2400, height: 2400 } },
        },
      },
    },
    slug: { encoding: 'ascii', clean_accents: true },
    output: { omit_empty_optional_fields: true },
    collections: [
      {
        name: 'listings',
        label: 'Listings',
        label_singular: 'Listing',
        icon: 'grid_view',
        folder: 'content/listings',
        extension: 'md',
        format: 'frontmatter',
        create: true,
        slug: '{{title}}',
        reorder: true,
        preview_path: `/${site.listingsPath}/{{slug}}/`,
        summary: '{{title}}{{label | prefix(" · ")}}',
        thumbnail: 'image',
        sortable_fields: ['order', 'title'],
        view_filters: [{ label: 'Hidden', field: 'hidden', pattern: true }],
        fields: [
          { name: 'title', label: 'Name', widget: 'string' },
          str('label', 'Card heading', { hint: 'Short text in the top corner of the card, e.g. "Real Estate Airbnb"' }),
          {
            name: 'category', label: 'Category', widget: 'relation', required: false,
            collection: 'categories', value_field: '{{slug}}', search_fields: ['name'], display_fields: ['name'],
          },
          bool('verified', 'Show verified badge'),
          txt('summary', 'Short description', { hint: 'Shown on the card and at the top of the listing page' }),
          img('image', 'Card image', { hint: 'Square, about 800 × 800' }),
          img('banner', 'Banner image', { hint: 'Wide image at the top of the listing page, about 1600 × 500. Phones crop the sides slightly, so keep the subject near the middle.' }),
          img('logo', 'Logo', { hint: 'Square, about 200 × 200, shown over the banner. Uses the card image if empty.' }),
          str('byline', 'By'),
          { name: 'launchDate', label: 'Launch date', widget: 'datetime', required: false, time_format: false, date_format: 'MMM YYYY' },
          str('linkUrl', 'Website link'),
          str('linkLabel', 'Website link text', { hint: 'Default: "Learn more here"' }),
          {
            name: 'stats', label: 'Key figures', widget: 'list', required: false,
            hint: 'Shown as tiles on the listing page. Tick "Show on card" for the ones that appear on the home page card.',
            summary: '{{fields.label}}: {{fields.value}}',
            fields: [str('label', 'Label', { required: true }), str('value', 'Value', { required: true }), bool('onCard', 'Show on card')],
          },
          bool('hidden', 'Hide from the site'),
          { name: 'body', label: 'Overview', widget: 'markdown', required: false },
        ],
      },
      {
        name: 'categories',
        label: 'Categories',
        label_singular: 'Category',
        icon: 'sell',
        folder: 'content/categories',
        extension: 'json',
        format: 'json',
        create: true,
        slug: '{{name}}',
        identifier_field: 'name',
        reorder: true,
        summary: '{{name}}',
        fields: [
          { name: 'name', label: 'Name', widget: 'string' },
          img('icon', 'Icon', { hint: 'Small square icon, ideally SVG' }),
        ],
      },
      {
        name: 'pages',
        label: 'Pages',
        label_singular: 'Page',
        icon: 'description',
        folder: 'content/pages',
        extension: 'md',
        format: 'frontmatter',
        create: true,
        slug: '{{title}}',
        preview_path: '/{{slug}}/',
        fields: [
          { name: 'title', label: 'Title', widget: 'string' },
          str('description', 'Search engine description'),
          bool('hidden', 'Hide from the site'),
          { name: 'body', label: 'Content', widget: 'markdown', required: false },
        ],
      },
      {
        name: 'home',
        label: 'Home page',
        icon: 'home',
        files: [
          {
            name: 'home',
            label: 'Home page',
            file: 'content/settings/home.json',
            format: 'json',
            preview_path: '/',
            fields: [
              {
                name: 'hero', label: 'Top section', widget: 'object',
                fields: [
                  str('title', 'Headline'),
                  txt('text', 'Intro text'),
                  img('image', 'Image', { hint: 'Tall, about 700 × 1000' }),
                  str('imageAlt', 'Image description', { hint: 'For screen readers' }),
                  str('categoriesLabel', 'Text above categories'),
                ],
              },
              {
                name: 'listings', label: 'Listings section', widget: 'object',
                fields: [str('heading', 'Heading'), str('emptyText', 'Text when there are no listings')],
              },
              {
                name: 'faq', label: 'Questions section', widget: 'object',
                fields: [
                  str('heading', 'Heading'),
                  {
                    name: 'items', label: 'Questions', widget: 'list', required: false, summary: '{{fields.question}}',
                    fields: [str('question', 'Question', { required: true }), txt('answer', 'Answer', { required: true })],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'settings',
        label: 'Site settings',
        icon: 'tune',
        files: [
          {
            name: 'general',
            label: 'Branding & layout',
            file: 'content/settings/general.json',
            format: 'json',
            fields: [
              { name: 'siteName', label: 'Site name', widget: 'string' },
              txt('description', 'Search engine description'),
              img('logo', 'Logo'),
              { name: 'logoHeight', label: 'Logo height (pixels)', widget: 'number', value_type: 'int', min: 20, max: 120, default: 40, required: false },
              img('favicon', 'Browser tab icon', { hint: 'Square PNG or SVG' }),
              img('ogImage', 'Sharing image', { hint: 'Shown when the site is shared on social media (1200×630)' }),
              {
                name: 'theme', label: 'Colors & fonts', widget: 'object', collapsed: true,
                fields: [
                  color('accent', 'Accent color', '#facc15'),
                  color('text', 'Text color', '#111827'),
                  color('background', 'Page background', '#f9fafb'),
                  color('surface', 'Card background', '#ffffff'),
                  color('footer', 'Footer background', '#111827'),
                  str('font', 'Font', { default: 'Poppins', hint: 'Any Google Fonts name, e.g. Poppins, Inter, Lora' }),
                  str('headingFont', 'Heading font', { hint: 'Optional. Leave empty to use the main font.' }),
                ],
              },
              linkList('nav', 'Menu links'),
              {
                name: 'footer', label: 'Footer', widget: 'object',
                fields: [
                  str('noticeTitle', 'Notice heading', { hint: 'e.g. "Important disclaimer". Leave empty to hide the notice box.' }),
                  txt('noticeText', 'Notice text'),
                  linkList('links', 'Footer links', 'Leave empty to list every page'),
                  str('copyright', 'Copyright line', { hint: '{year} is replaced with the current year' }),
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'publishing',
        label: 'Publishing',
        icon: 'published_with_changes',
        // Always saved straight away, so switching modes never needs a review.
        publish_mode: 'simple',
        files: [
          {
            name: 'publishing',
            label: 'How changes go live',
            file: 'content/settings/publishing.json',
            format: 'json',
            fields: [
              {
                name: 'mode', label: 'When I save a change…', widget: 'select', default: 'simple',
                options: [
                  { label: 'Publish it straight away', value: 'simple' },
                  { label: 'Let me preview it first, then publish', value: 'preview' },
                  { label: 'Draft → review → publish', value: 'editorial_workflow' },
                ],
                hint:
                  'Takes effect about two minutes after saving. Reload the editor afterwards. ' +
                  'Before switching back to "straight away", publish or delete any unpublished drafts, or they will be hidden.',
              },
            ],
          },
        ],
      },
    ],
  };
}
