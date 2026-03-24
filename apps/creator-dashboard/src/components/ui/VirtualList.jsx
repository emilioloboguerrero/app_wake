import { List } from 'react-window';
import './VirtualList.css';

function Row({ index, style, items, renderItem }) {
  return renderItem(items[index], index, style);
}

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
      <List
        rowCount={items.length}
        rowHeight={itemHeight}
        rowComponent={Row}
        rowProps={{ items, renderItem }}
        className="virtual-list-scroller"
        style={{ height, background: 'transparent' }}
      />
    </div>
  );
}
