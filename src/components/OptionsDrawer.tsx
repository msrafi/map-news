import { format, parseISO } from 'date-fns'
import { formatStamp, formatUpdated, freshnessOf, shortAge } from '../lib/time'
import type { NewsMedia, OptionContract, TickerGroup, TickerTrade } from '../types'
import { MediaStrip } from './MediaStrip'

type OptionsDrawerProps = {
  group: TickerGroup
  onClose: () => void
}

type Post = {
  id: string
  publishedAt: string
  author: string
  handle: string
  text: string
  sourceUrl: string
  media?: NewsMedia[]
  contracts: OptionContract[]
}

/** The column groups by ticker, but a post can carry several of its contracts. */
function postsOf(trades: TickerTrade[]): Post[] {
  const posts = new Map<string, Post>()

  for (const { item, contract } of trades) {
    const post = posts.get(item.id)
    if (post) post.contracts.push(contract)
    else
      posts.set(item.id, {
        id: item.id,
        publishedAt: item.publishedAt,
        author: item.author,
        handle: item.handle,
        text: item.text,
        sourceUrl: item.sourceUrl,
        media: item.media,
        contracts: [contract],
      })
  }

  return [...posts.values()]
}

function Contract({ contract }: { contract: OptionContract }) {
  return (
    <span className={`option-contract is-${contract.side}`}>
      <strong>
        {contract.strike}
        {contract.side === 'call' ? 'C' : 'P'}
      </strong>
      {contract.expiry ? <span>{contract.expiry}</span> : null}
      {contract.premium ? <span>@ {contract.premium}</span> : null}
      {contract.contracts !== undefined ? <span>{contract.contracts}x</span> : null}
      {contract.notional ? <span>{contract.notional}</span> : null}
    </span>
  )
}

export function OptionsDrawer({ group, onClose }: OptionsDrawerProps) {
  const posts = postsOf(group.trades)

  return (
    <section className="drawer options" aria-label={`${group.ticker} option trades`}>
      <header className="drawer__header">
        <h2>${group.ticker}</h2>
        <span className="drawer__count">
          {group.calls}C · {group.puts}P
        </span>
        <button type="button" onClick={onClose} aria-label={`Close ${group.ticker} trades`}>
          Close
        </button>
      </header>

      <ul className="drawer__list">
        {posts.map((post) => (
          <li key={post.id} className={`option-post is-${freshnessOf(post.publishedAt)}`}>
            <div className="drawer__meta">
              <time dateTime={post.publishedAt} title={formatStamp(post.publishedAt)}>
                {format(parseISO(post.publishedAt), 'd MMM, HH:mm')}
              </time>
              <span className="drawer__age">{shortAge(post.publishedAt)}</span>
              {post.handle ? (
                <span className="post-handle" title={post.author}>
                  {post.handle}
                </span>
              ) : null}
              <a
                className="option-post__source"
                href={post.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on X"
                title={`Open on X · ${formatUpdated(post.publishedAt).relative}`}
              >
                ↗
              </a>
            </div>

            <div className="options__contracts">
              {post.contracts.map((contract, index) => (
                <Contract key={`${post.id}-${index}`} contract={contract} />
              ))}
            </div>

            <p className="option-post__text">{post.text}</p>

            {post.media?.length ? <MediaStrip media={post.media} /> : null}
          </li>
        ))}
        {posts.length === 0 ? (
          <li className="drawer__empty">No tweets for ${group.ticker} yet.</li>
        ) : null}
      </ul>
    </section>
  )
}
