import { useState } from 'react'
import type { NewsMedia } from '../types'

type MediaStripProps = {
  media: NewsMedia[]
  /** Off inside a button, which cannot hold a link. */
  linked?: boolean
  size?: 'sm' | 'lg'
}

/** X can retire a render, so a picture that fails to load leaves no gap behind. */
function Shot({ media, linked }: { media: NewsMedia; linked: boolean }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null

  const image = (
    <img src={media.thumb} alt={media.alt ?? ''} loading="lazy" onError={() => setBroken(true)} />
  )
  if (!linked) return <span className="media-strip__shot">{image}</span>

  return (
    <a className="media-strip__shot" href={media.full} target="_blank" rel="noreferrer">
      {image}
    </a>
  )
}

export function MediaStrip({ media, linked = true, size = 'sm' }: MediaStripProps) {
  if (media.length === 0) return null

  return (
    <span className={`media-strip is-${size}`}>
      {media.map((entry) => (
        <Shot key={entry.thumb} media={entry} linked={linked} />
      ))}
    </span>
  )
}
