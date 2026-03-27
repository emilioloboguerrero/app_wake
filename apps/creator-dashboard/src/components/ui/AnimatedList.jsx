import { Children } from 'react';
import './AnimatedList.css';

export default function AnimatedList({
  children,
  stagger = 60,
  initialDelay = 0,
  className,
  as: Tag = 'div',
}) {
  return (
    <Tag className={className}>
      {Children.map(children, (child, i) => {
        if (!child) return null;
        const delay = initialDelay + i * stagger;
        return (
          <div
            className="animated-list-item"
            style={{ '--delay': `${delay}ms` }}
          >
            {child}
          </div>
        );
      })}
    </Tag>
  );
}
