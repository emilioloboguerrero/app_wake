import React, { useRef } from 'react';
import { motion, useInView } from 'motion/react';

export const SEI_EASE = [0.44, 0, 0.56, 1];

// Sei-style text entrance:
//   • The whole block rises from y:12 → 0 as one unit (1s, SEI_EASE).
//   • Each letter independently fades opacity 0.001 → 1, staggered
//     0.012s in reading order. The block movement and the letter-by-letter
//     fade play at the same time, so the line lifts into place while
//     its letters light up in sequence.
export default function CascadeText({
  children,
  chunks,
  className,
  delay = 0,
  stagger = 0.012,
  as: Tag = 'span',
  style: styleProp,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const MotionTag = motion[Tag] || motion.span;
  const isInline = Tag === 'span';

  const charTokens = [];
  if (chunks) {
    chunks.forEach((chunk) => {
      Array.from(chunk.text).forEach((char) => charTokens.push({ char, bold: chunk.bold }));
    });
  } else {
    Array.from(String(children)).forEach((char) => charTokens.push({ char, bold: false }));
  }
  const ariaLabel = chunks ? chunks.map((c) => c.text).join('') : String(children);

  const segments = [];
  let current = null;
  charTokens.forEach((tok) => {
    if (tok.char === ' ' || tok.char === '\n') {
      if (current) { segments.push(current); current = null; }
      segments.push({ type: 'space', char: tok.char });
    } else {
      if (!current) current = { type: 'word', chars: [] };
      current.chars.push(tok);
    }
  });
  if (current) segments.push(current);

  let letterIdx = 0;

  return (
    <MotionTag
      ref={ref}
      className={className}
      aria-label={ariaLabel}
      style={{ ...(isInline ? { display: 'inline-block' } : null), ...styleProp }}
      initial={{ y: 12 }}
      animate={inView ? { y: 0 } : { y: 12 }}
      transition={{ duration: 1, delay, ease: SEI_EASE }}
    >
      {segments.map((seg, si) => {
        if (seg.type === 'space') return <React.Fragment key={si}>{seg.char === '\n' ? '\n' : ' '}</React.Fragment>;
        return (
          <span key={si} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {seg.chars.map((tok, ci) => {
              const idx = letterIdx++;
              const El = tok.bold ? motion.strong : motion.span;
              return (
                <El
                  key={ci}
                  aria-hidden="true"
                  style={{ display: 'inline-block' }}
                  initial={{ opacity: 0.001 }}
                  animate={inView ? { opacity: 1 } : { opacity: 0.001 }}
                  transition={{
                    duration: 0.2,
                    delay: delay + idx * stagger,
                    ease: SEI_EASE,
                  }}
                >
                  {tok.char}
                </El>
              );
            })}
          </span>
        );
      })}
    </MotionTag>
  );
}
