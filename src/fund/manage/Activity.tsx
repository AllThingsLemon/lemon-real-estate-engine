// Activity: everything that happened on the project, newest first, from the
// indexer. Each line links to its transaction.
import { useState } from 'react';
import { FEED_GROUPS, Feed } from './Feed';
import { ixProblem, useIxActivity } from './ix';
import { Callout, Card, Empty } from './ui';
import { useV } from './view';

export function Activity() {
  const v = useV();
  const [group, setGroup] = useState('');
  const q = useIxActivity(v.listing.project, group ? FEED_GROUPS[group].names : undefined, 40);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card
      title="Activity"
      subtitle="Everything that happened on this project, newest first. Each line links to its transaction."
      actions={
        <div className="mg-chips" role="group" aria-label="Show">
          {[['', 'All'] as const, ...Object.entries(FEED_GROUPS).map(([k, g]) => [k, g.label] as const)].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={group === k} onClick={() => setGroup(k)}>
              {label}
            </button>
          ))}
        </div>
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
            <button type="button" className="mg-btn mg-quiet mg-small mg-gap-top" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              {q.isFetchingNextPage ? 'Loading…' : 'Load older'}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
