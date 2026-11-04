// Activity: everything that happened on the project, newest first, from the
// indexer. Each line links to its transaction.
import { useState } from 'react';
import { FEED_GROUPS, Feed } from './Feed';
import { ixProblem, useIxActivity } from './ix';
import { DO, PAGE_HELP } from './help';
import { Callout, Card, Empty, Segmented, TipButton } from './ui';
import { useV } from './view';

const GROUP_TIPS: Record<string, string> = {
  payments: 'Interest and fee payments, repayments and renewals.',
  money: 'Deposits, collections, added money, splits, withdrawals and pool moves.',
  compound: 'LEMX purchases: started, floor lowered, finished, locked.',
  admin: 'Roles, the allowlist, ownership, pausing, stopping deposits and wallet changes.',
};

export function Activity() {
  const v = useV();
  const [group, setGroup] = useState('');
  const q = useIxActivity(v.listing.project, group ? FEED_GROUPS[group].names : undefined, 40);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card
      title="Activity"
      help={PAGE_HELP.activity}
      subtitle="Everything that happened on this project, newest first. Each line links to its transaction."
      actions={
        <Segmented
          label="Show"
          value={group}
          onChange={setGroup}
          items={[
            { id: '', label: 'All', tip: 'Every event.' },
            ...Object.entries(FEED_GROUPS).map(([k, g]) => ({ id: k, label: g.label, tip: GROUP_TIPS[k] })),
          ]}
        />
      }
    >
      {q.error ? (
        <Callout tone="warn">{ixProblem(q.error, 'Activity and history')}</Callout>
      ) : q.isPending ? (
        <p className="mg-muted">Loading…</p>
      ) : !items.length ? (
        <Empty title="No activity" />
      ) : (
        <>
          <Feed items={items} />
          {q.hasNextPage && (
            <TipButton className="mg-btn mg-quiet mg-small mg-start mg-gap-top" tip={DO.loadOlder} disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              {q.isFetchingNextPage ? 'Loading…' : 'Load older'}
            </TipButton>
          )}
        </>
      )}
    </Card>
  );
}
