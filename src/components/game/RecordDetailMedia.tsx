interface RecordDetailMediaProps { src?: string; kind: 'portrait' | 'scene'; name: string }

export function RecordDetailMedia({ src, kind, name }: RecordDetailMediaProps) {
  if (!src) return null;
  return <figure className={`record-detail-media ${kind}`} key={src}>
    <img src={src} alt={`${name}${kind === 'scene' ? '场景' : '立绘'}`} decoding="async"
      onError={(event) => { event.currentTarget.parentElement!.hidden = true; }} />
  </figure>;
}
