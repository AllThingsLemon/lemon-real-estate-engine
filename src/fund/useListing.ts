// Live data for a listing's project, read with contract calls only (no event
// logs: the public RPCs refuse eth_getLogs). Two queries: the link check and
// the project's wiring, read once per page load, then the project state,
// re-read in the background.
import { useQuery } from '@tanstack/react-query';
import { erc20Abi, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi, projectFactoryAbi, projectLensAbi } from './abi';

export interface FundLink {
  project: Address;
  factories: readonly Address[];
  lens: Address;
  trustedOwners: readonly Address[];
}

export type LinkCheck =
  | { trusted: false; reason: string }
  | { trusted: true; token: { address: Address; decimals: number; symbol: string }; cycleDuration: bigint };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The checks in docs/WALLET_PLAN.md ("Checking the link before any money
 * moves"): the project was made by a factory this site trusts, that factory
 * vouches for it, and its owner is one this site trusts. Anyone can deploy a
 * project and a CMS editor can paste any address, so nothing else is shown
 * until these pass.
 */
export function useLinkCheck(link: FundLink) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['fund-link', link.project],
    staleTime: Infinity,
    enabled: Boolean(client),
    queryFn: async (): Promise<LinkCheck> => {
      const { project, factories, trustedOwners } = link;
      const [[factory, owner, usdt, cycleDuration], vouched] = await Promise.all([
        client!.multicall({
          allowFailure: true,
          contracts: [
            { address: project, abi: projectAbi, functionName: 'factory' },
            { address: project, abi: projectAbi, functionName: 'owner' },
            { address: project, abi: projectAbi, functionName: 'usdt' },
            { address: project, abi: projectAbi, functionName: 'cycleDuration' },
          ],
        }),
        client!.multicall({
          allowFailure: true,
          contracts: factories.map((f) => ({ address: f, abi: projectFactoryAbi, functionName: 'isProject', args: [project] }) as const),
        }),
      ]);
      if (factory.status !== 'success' || owner.status !== 'success' || usdt.status !== 'success' || cycleDuration.status !== 'success') {
        return { trusted: false, reason: `${project} isn't a fund project on this network` };
      }
      const i = factories.findIndex((f) => same(f, factory.result));
      if (i < 0) return { trusted: false, reason: `its factory ${factory.result} isn't in fund.factories` };
      if (vouched[i].status !== 'success' || vouched[i].result !== true) {
        return { trusted: false, reason: `factory ${factory.result} doesn't list it as one of its projects` };
      }
      if (!trustedOwners.some((o) => same(o, owner.result))) {
        return { trusted: false, reason: `its owner ${owner.result} isn't in fund.trustedOwners` };
      }
      const [decimals, symbol] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: usdt.result, abi: erc20Abi, functionName: 'decimals' },
          { address: usdt.result, abi: erc20Abi, functionName: 'symbol' },
        ],
      });
      return { trusted: true, token: { address: usdt.result, decimals, symbol }, cycleDuration: cycleDuration.result };
    },
  });
}

/** Raise, rates, status and payment health. Only runs once the link check passes. */
export function useProjectState(link: FundLink, enabled: boolean) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['fund-state', link.project],
    enabled: enabled && Boolean(client),
    refetchInterval: 30_000,
    queryFn: async () => {
      const [state, config, nextDue] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: link.lens, abi: projectLensAbi, functionName: 'getProjectState', args: [link.project] },
          { address: link.project, abi: projectAbi, functionName: 'config' },
          { address: link.project, abi: projectAbi, functionName: 'nextDue' },
        ],
      });
      return { state, config, nextDue };
    },
  });
}
