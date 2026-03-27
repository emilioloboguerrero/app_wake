import './CrossReferenceChip.css';

export default function CrossReferenceChip({ icon, label, detail, onClick }) {
  return (
    <button className="crc-chip" onClick={onClick} type="button">
      {icon && <span className="crc-chip-icon">{icon}</span>}
      <span className="crc-chip-label">{label}</span>
      {detail && <span className="crc-chip-detail">{detail}</span>}
      <span className="crc-chip-arrow">→</span>
    </button>
  );
}
