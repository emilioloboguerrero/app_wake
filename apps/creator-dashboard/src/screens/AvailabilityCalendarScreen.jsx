import React, { useState } from 'react';
import { TubelightNavBar } from '../components/ui';
import MiHorarioView from '../components/llamadas/MiHorarioView';
import ContextualHint from '../components/hints/ContextualHint';
import ProximasLlamadasView from '../components/llamadas/ProximasLlamadasView';
import './AvailabilityCalendarScreen.css';

const SUB_TABS = [
  { id: 'horario', label: 'Mi horario' },
  { id: 'llamadas', label: 'Próximas llamadas' },
];

export function AvailabilityContent() {
  const [activeSubTab, setActiveSubTab] = useState('horario');

  return (
    <div className="llamadas-container">
      <TubelightNavBar
        items={SUB_TABS}
        activeId={activeSubTab}
        onSelect={setActiveSubTab}
      />
      <div className="llamadas-content">
        {activeSubTab === 'horario' && <MiHorarioView />}
        {activeSubTab === 'llamadas' && <ProximasLlamadasView />}
      </div>
      <ContextualHint screenKey="availability" />
    </div>
  );
}

export default function AvailabilityCalendarScreen() {
  return <AvailabilityContent />;
}
