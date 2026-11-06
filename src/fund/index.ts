// The wallet components pages use, imported as "@engine/fund". astro.config.mjs
// points that here only on sites with a "fund" block, and at none.ts
// otherwise, so other clients' builds never include React, viem or any of
// this.
export { default as FundIsland } from './FundIsland.astro';
export { default as FundBanner } from './FundBanner.astro';
export { default as FundPanelSlot } from './PanelSlot.astro';
