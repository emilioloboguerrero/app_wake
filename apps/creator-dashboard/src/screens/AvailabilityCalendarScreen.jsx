import React, { useState } from 'react';
import { TubelightNavBar, KeepAlivePane } from '../components/ui';
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
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['horario']));

  const handleTabChange = (tabId) => {
    setActiveSubTab(tabId);
    setVisitedTabs(prev => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  return (
    <div className="llamadas-container">
      <TubelightNavBar
        items={SUB_TABS}
        activeId={activeSubTab}
        onSelect={handleTabChange}
      />
      <div className="llamadas-content">
        {visitedTabs.has('horario') && (
          <KeepAlivePane active={activeSubTab === 'horario'}>
            <MiHorarioView />
          </KeepAlivePane>
        )}
        {visitedTabs.has('llamadas') && (
          <KeepAlivePane active={activeSubTab === 'llamadas'}>
            <ProximasLlamadasView />
          </KeepAlivePane>
        )}
      </div>
      <ContextualHint screenKey="availability" />
    </div>
  );
}

export default function AvailabilityCalendarScreen() {
  return <AvailabilityContent />;
}
