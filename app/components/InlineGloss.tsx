'use client';

interface InlineGlossProps {
  furigana: string;
  pos: string;
  meaning: string;
  loading: boolean;
  visible: boolean;
  onOpenDetails: () => void;
}

export default function InlineGloss({
  furigana,
  pos,
  meaning,
  loading,
  visible,
  onOpenDetails,
}: InlineGlossProps) {
  return (
    <div
      className={`annotation-gloss ${visible ? 'is-visible' : ''}`}
      lang="zh-CN"
      aria-hidden={!visible}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="gloss-line-one">
        <span className="gloss-kana" lang="ja">{furigana}</span>
        <span className="gloss-pos">〔{pos}〕</span>
      </div>
      <div className="gloss-line-two">
        <span className={loading ? 'gloss-meaning is-loading' : 'gloss-meaning'}>
          {meaning || '释义生成中…'}
        </span>
        <button
          type="button"
          className="gloss-more"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetails();
          }}
        >
          詳細 →
        </button>
      </div>
    </div>
  );
}
