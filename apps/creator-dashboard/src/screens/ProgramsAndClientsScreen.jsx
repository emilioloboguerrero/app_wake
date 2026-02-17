import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import ProductsScreen from './ProductsScreen';
import OneOnOneScreen from './OneOnOneScreen';
import './ProgramsAndClientsScreen.css';
import './ContentHubScreen.css';

const SUB_TABS = [
  { id: 'programas', label: 'Programas' },
  { id: 'clientes', label: 'Clientes' },
];

const ProgramsAndClientsScreen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeSubTab = tabParam === 'clientes' ? 'clientes' : 'programas';
  const [showTypeSelectionModal, setShowTypeSelectionModal] = useState(false);

  const handleSubTabClick = (id) => {
    if (id === 'clientes') {
      setSearchParams({ tab: 'clientes' });
    } else {
      setSearchParams({});
    }
  };

  const handleNewProgramClick = () => {
    setShowTypeSelectionModal(true);
  };

  const handleTypeLowTicket = () => {
    setShowTypeSelectionModal(false);
    navigate('/products/new?type=low_ticket');
  };

  const handleTypeOneOnOne = () => {
    setShowTypeSelectionModal(false);
    navigate('/products/new?type=one_on_one');
  };

  return (
    <DashboardLayout
      screenName="Programas y clientes"
      showBackButton={true}
      backPath="/lab"
    >
      <div className="programs-clients-screen">
        <div className="programs-clients-tabs">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`programs-clients-tab ${activeSubTab === tab.id ? 'active' : ''}`}
              onClick={() => handleSubTabClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="programs-clients-content">
          {activeSubTab === 'programas' && <ProductsScreen noLayout onNewClick={handleNewProgramClick} />}
          {activeSubTab === 'clientes' && <OneOnOneScreen noLayout />}
        </div>
      </div>

      <Modal
        isOpen={showTypeSelectionModal}
        onClose={() => setShowTypeSelectionModal(false)}
        title="Tipo de programa"
      >
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text" style={{ marginBottom: '24px' }}>
            Selecciona el tipo de programa que deseas crear:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              type="button"
              className="content-hub-create-button"
              onClick={handleTypeLowTicket}
              style={{ width: '100%', justifyContent: 'flex-start', padding: '16px' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '12px' }}>
                <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>Low-ticket</span>
                <span style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>Programas generales y escalables para múltiples usuarios</span>
              </div>
            </button>
            <button
              type="button"
              className="content-hub-create-button"
              onClick={handleTypeOneOnOne}
              style={{ width: '100%', justifyContent: 'flex-start', padding: '16px' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '12px' }}>
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>1-on-1</span>
                <span style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>Programas personalizados para clientes individuales</span>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProgramsAndClientsScreen;
