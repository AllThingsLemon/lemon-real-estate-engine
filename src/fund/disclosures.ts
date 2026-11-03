// The client's investor disclosures (content/settings/investing.json, edited in
// the CMS and reviewed by counsel; docs/SAMPLE_DISCLOSURES.md is the starting
// text). The text is plain with three bits of formatting, so it can't break
// the page: a blank line starts a new paragraph, lines starting "- " are a
// list, and **bold**. {placeholders} are filled from the listing, the
// contract and the wallet; unknown ones are left as typed so they're noticed.

export interface Disclosures {
  company: string;
  testBanner: string;
  listingNotice: string;
  notApproved: string;
  riskSummary: string;
  acknowledgments: string[];
  confirmation: string;
}

/** Shown when a testnet site's disclosures leave the banner empty. */
export const DEFAULT_TEST_BANNER =
  '**Test network.** This project runs on {network}, a test network. Tokens here have no value and no real investment is made.';

/** Shown when the disclosures leave "Not approved yet" empty. {wallet} on its own line is the address to copy. */
export const DEFAULT_NOT_APPROVED =
  "**This wallet isn't approved for {project} yet.** To invest, include this wallet address in your subscription documents:\n\n{wallet}\n\nYou can invest here once your documents are reviewed and the wallet is approved. Approval is for this project only.";

export type Inline = { text: string; bold: boolean }[];
export type Block = { list: false; text: Inline } | { list: true; items: Inline[] };

export type Values = Record<string, string | undefined>;

const fill = (text: string, values: Values) => text.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);

/** "a **b** c" → segments, with placeholders filled after the formatting is read. */
function inline(text: string, values: Values): Inline {
  return text
    .split('**')
    .map((part, i) => ({ text: fill(part, values), bold: i % 2 === 1 }))
    .filter((s) => s.text);
}

export function parse(text: string, values: Values): Block[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines): Block =>
      lines.every((l) => l.startsWith('- '))
        ? { list: true, items: lines.map((l) => inline(l.slice(2), values)) }
        : { list: false, text: inline(lines.join(' '), values) },
    );
}

/** Investing needs the acknowledgments and the deposit confirmation. */
export const canInvest = (d: Disclosures | null) => Boolean(d && d.acknowledgments.some((a) => a.trim()) && d.confirmation.trim());
