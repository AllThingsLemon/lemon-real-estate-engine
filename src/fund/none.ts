// "@engine/fund" on sites without a "fund" block: every wallet component is
// an empty stand-in (see index.ts).
import NoFund from './NoFund.astro';

export { NoFund as FundIsland, NoFund as FundBanner, NoFund as FundPanelSlot };
