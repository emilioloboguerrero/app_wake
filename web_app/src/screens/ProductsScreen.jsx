import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import programService from '../services/programService';
import './ProductsScreen.css';

const ProductsScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [productType, setProductType] = useState('low_ticket'); // 'low_ticket' | 'one_on_one'

  // Fetch all programs
  const { data: allPrograms = [], isLoading } = useQuery({
    queryKey: ['programs', user?.uid],
    queryFn: async () => {
      if (!user) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user,
  });

  // Filter programs by type
  const lowTicketPrograms = allPrograms.filter(p => (p.deliveryType || 'low_ticket') === 'low_ticket');
  const oneOnOnePrograms = allPrograms.filter(p => p.deliveryType === 'one_on_one');

  const currentPrograms = productType === 'low_ticket' ? lowTicketPrograms : oneOnOnePrograms;

  const handleCreateLowTicket = () => {
    navigate('/products/low-ticket/new');
  };

  const handleCreateOneOnOne = () => {
    navigate('/products/one-on-one/new');
  };

  const handleProgramClick = (programId) => {
    navigate(`/programs/${programId}`);
  };

  return (
    <DashboardLayout screenName="Productos">
      <div className="products-screen">
        {/* Product Type Selector */}
        <div className="products-type-selector">
          <button
            className={`products-type-tab ${productType === 'low_ticket' ? 'active' : ''}`}
            onClick={() => setProductType('low_ticket')}
          >
            <div className="products-type-tab-content">
              <div className="products-type-tab-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="products-type-tab-info">
                <h3 className="products-type-tab-title">Low-Ticket</h3>
                <p className="products-type-tab-description">
                  Programas completos con contenido que vendes a múltiples usuarios
                </p>
              </div>
            </div>
            <div className="products-type-tab-count">
              {lowTicketPrograms.length}
            </div>
          </button>

          <button
            className={`products-type-tab ${productType === 'one_on_one' ? 'active' : ''}`}
            onClick={() => setProductType('one_on_one')}
          >
            <div className="products-type-tab-content">
              <div className="products-type-tab-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="products-type-tab-info">
                <h3 className="products-type-tab-title">1-on-1</h3>
                <p className="products-type-tab-description">
                  Contenedores para organizar clientes. Asigna contenido con Planes
                </p>
              </div>
            </div>
            <div className="products-type-tab-count">
              {oneOnOnePrograms.length}
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="products-content">
          <div className="products-header">
            <h2 className="products-title">
              {productType === 'low_ticket' ? 'Low-Ticket' : '1-on-1'}
            </h2>
            <button
              className="products-create-button"
              onClick={productType === 'low_ticket' ? handleCreateLowTicket : handleCreateOneOnOne}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Nuevo
            </button>
          </div>

          {isLoading ? (
            <div className="products-loading">Cargando programas...</div>
          ) : currentPrograms.length === 0 ? (
            <div className="products-empty">
              <div className="products-empty-icon">
                {productType === 'low_ticket' ? (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  </svg>
                ) : (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  </svg>
                )}
              </div>
              <h3>No hay programas {productType === 'low_ticket' ? 'low-ticket' : '1-on-1'}</h3>
              <button
                className="products-empty-button"
                onClick={productType === 'low_ticket' ? handleCreateLowTicket : handleCreateOneOnOne}
              >
                Crear Programa
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {currentPrograms.map((program) => (
                <div
                  key={program.id}
                  className="products-card"
                  onClick={() => handleProgramClick(program.id)}
                >
                  {program.image_url ? (
                    <div className="products-card-image-wrapper">
                      <img
                        src={program.image_url}
                        alt={program.title}
                        className="products-card-image"
                      />
                      <div className="products-card-overlay">
                        <h3 className="products-card-title">{program.title || 'Programa sin nombre'}</h3>
                      </div>
                    </div>
                  ) : (
                    <div className="products-card-header">
                      <div className="products-card-icon">
                        {productType === 'low_ticket' ? (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <h3 className="products-card-title">{program.title || 'Programa sin nombre'}</h3>
                    </div>
                  )}

                  <div className="products-card-body">
                    {program.description && (
                      <p className="products-card-description">{program.description}</p>
                    )}
                    <div className="products-card-meta">
                      {program.discipline && (
                        <span className="products-card-meta-item">{program.discipline}</span>
                      )}
                      {program.status && (
                        <span className={`products-card-status products-card-status-${program.status}`}>
                          {program.status === 'draft' ? 'Borrador' : 'Publicado'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="products-card-footer">
                    <span className="products-card-action">Gestionar →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProductsScreen;

