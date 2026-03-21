import { FixedSizeList } from 'react-window';
import './VirtualList.css';

export default function VirtualList({
  items,
  renderItem,
  itemHeight,
  height,
  emptyState = null,
}) {
  if (!items || items.length === 0) {
    return emptyState;
  }

  return (
    <div className="virtual-list-container">
      <FixedSizeList
        height={height}
        itemCount={items.length}
        itemSize={itemHeight}
        width="100%"
        className="virtual-list-scroller"
        style={{ background: 'transparent' }}
      >
        {({ index, style }) => renderItem(items[index], index, style)}
      </FixedSizeList>
    </div>
  );
}
