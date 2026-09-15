import { format, parseISO } from 'date-fns'
import { formatUpdated, freshnessOf, shortAge } from '../lib/time'
import type { OptionContract, TickerGroup, TickerTrade } from '../types'

type OptionsDrawerProps = {
  group: TickerGroup
  onClose: () => void
}

type Post = {
  id: string
  publishedAt: string
  text: string
  sourceUrl: string
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
        text: item.text,
        sourceUrl: item.sourceUrl,
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
              <time dateTime={post.publishedAt}>
                {format(parseISO(post.publishedAt), 'HH:mm')}
              </time>
              <span className="drawer__age">{shortAge(post.publishedAt)}</span>
              <span className="option-post__when">{formatUpdated(post.publishedAt).relative}</span>
            </div>

            <div className="options__contracts">
              {post.contracts.map((contract, index) => (
                <Contract key={`${post.id}-${index}`} contract={contract} />
              ))}
            </div>

            <p className="option-post__text">{post.text}</p>

            <a href={post.sourceUrl} target="_blank" rel="noreferrer">
              Open on X
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
