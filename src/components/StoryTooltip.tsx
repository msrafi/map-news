import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatStamp, formatUpdated } from '../lib/time'
import type { MarketDetail, NewsItem, OptionContract } from '../types'
import { MediaStrip } from './MediaStrip'

export type StoryTip = {
  item: NewsItem
  details: MarketDetail[]
  contracts: OptionContract[]
  /** Viewport rect of the row that opened it, so the card can sit alongside. */
  anchor: { top: number; right: number; bottom: number }
}

type StoryTooltipProps = {
  tip: StoryTip
  onClose: () => void
}

const MARGIN = 10

function formatChange(change: number): string {
  return `${change > 0 ? '+' : ''}${change}%`
}

export function StoryTooltip({ tip, onClose }: StoryTooltipProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(tip.anchor.top)
  const updated = formatUpdated(tip.item.publishedAt)

  // Keep the card on screen when the row sits near the bottom of a long list.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 0
    const limit = window.innerHeight - height - MARGIN
    setTop(Math.max(MARGIN, Math.min(tip.anchor.top, limit)))
  }, [tip])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button className="story-tip__backdrop" type="button" aria-label="Close details" onClick={onClose} />
      <div
        ref={cardRef}
        className="story-tip"
        role="dialog"
        aria-label="Post details"
        style={{ top, left: tip.anchor.right + MARGIN }}
      >
        <header>
          <span className="story-tip__handle">{tip.item.handle}</span>
          <time dateTime={tip.item.publishedAt}>
            {formatStamp(tip.item.publishedAt)} · {updated.relative}
          </time>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="story-tip__text">{tip.item.text}</p>

        {tip.item.media?.length ? <MediaStrip media={tip.item.media} size="lg" /> : null}

        {tip.details.length > 0 ? (
          <ul className="story-tip__rows">
            {tip.details.map((detail) => (
              <li key={detail.label}>
                <span className="story-tip__key">{detail.label}</span>
                {detail.value ? <span>{detail.value}</span> : null}
                {detail.changePct !== undefined ? (
                  <span className={detail.changePct >= 0 ? 'is-up' : 'is-down'}>
                    {formatChange(detail.changePct)}
                  </span>
                ) : null}
                {detail.previous ? <span className="story-tip__prev">prev {detail.previous}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tip.contracts.length > 0 ? (
          <ul className="story-tip__rows">
            {tip.contracts.map((contract, index) => (
              <li key={`${contract.ticker}-${contract.strike}-${index}`}>
                <span className="story-tip__key">${contract.ticker}</span>
                <span>
                  {contract.strike}
                  {contract.side === 'call' ? 'C' : 'P'}
                </span>
                {contract.expiry ? <span>exp {contract.expiry}</span> : null}
                {contract.premium ? <span>@ {contract.premium}</span> : null}
                {contract.contracts !== undefined ? <span>{contract.contracts}x</span> : null}
                {contract.notional ? <span>{contract.notional}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <footer>
          <span className="story-tip__region">{tip.item.region}</span>
          <a href={tip.item.sourceUrl} target="_blank" rel="noreferrer">
            Open on X
          </a>
        </footer>
      </div>
    </>
  )
}
