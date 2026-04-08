import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../config/queryClient';
import DashboardLayout from '../components/DashboardLayout';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import programService from '../services/programService';
import './ProductsScreen.css';

const PRODUCT_TYPES = ['low_ticket', 'one_on_one'];

const ProductsScreen = ({ noLayout = false, onNewClick = null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [productType, setProductType] = useState('low_ticket'); // 'low_ticket' | 'one_on_one'

  // Restore Programas sub-tab (Low-ticket vs 1-on-1) when returning from program detail
  useEffect(() => {
    if (location.pathname !== '/products') return;
    const fromState = location.state?.productType;
    if (fromState && PRODUCT_TYPES.includes(fromState)) {
      setProductType(fromState);
    }
  }, [location.pathname, location.key, location.state]);

  const { data: allPrograms = [], isLoading, isError } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user,
    ...cacheConfig.programStructure,
  });

  const lowTicketPrograms = allPrograms.filter(p => (p.deliveryType || 'low_ticket') === 'low_ticket');
  const oneOnOnePrograms = allPrograms.filter(p => p.deliveryType === 'one_on_one');

  const currentPrograms = productType === 'low_ticket' ? lowTicketPrograms : oneOnOnePrograms;

  const handleNewProgram = () => {
    if (onNewClick) {
      onNewClick();
    } else if (productType === 'low_ticket') {
      navigate('/products/new?type=low_ticket');
    } else {
      navigate('/products/new?type=one_on_one');
    }
  };

  const handleProgramClick = (programId) => {
    navigate(`/programs/${programId}`, {
      state: { returnTo: '/products', returnState: { productType } },
    });
  };

  const content = (
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
                <h3 className="products-type-tab-title">Generales</h3>
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
                <h3 className="products-type-tab-title">Asesorías</h3>
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
              {productType === 'low_ticket' ? 'Generales' : 'Asesorías'}
            </h2>
            <button
              className="products-create-button"
              onClick={handleNewProgram}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Nuevo
            </button>
          </div>

          {isError ? (
            <div className="products-loading" style={{ color: 'var(--text-secondary)' }}>Error al cargar programas. Intenta recargar la página.</div>
          ) : isLoading ? (
            <div className="products-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="products-card" style={{ pointerEvents: 'none' }}>
                  <div className="products-card-header">
                    <ShimmerSkeleton width="40px" height="40px" borderRadius="8px" />
                    <ShimmerSkeleton width="70%" height="18px" borderRadius="6px" />
                  </div>
                  <div className="products-card-body">
                    <ShimmerSkeleton width="100%" height="14px" borderRadius="4px" />
                    <ShimmerSkeleton width="60%" height="14px" borderRadius="4px" />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <ShimmerSkeleton width="80px" height="22px" borderRadius="10px" />
                      <ShimmerSkeleton width="60px" height="22px" borderRadius="10px" />
                    </div>
                  </div>
                  <div className="products-card-footer">
                    <ShimmerSkeleton width="90px" height="14px" borderRadius="4px" />
                  </div>
                </div>
              ))}
            </div>
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
              <h3>No hay programas {productType === 'low_ticket' ? 'generales' : 'de asesorías'}</h3>
              {productType === 'one_on_one' && (
                <p className="products-empty-description" style={{ marginTop: 8, marginBottom: 16, maxWidth: 360, opacity: 0.85, fontSize: 14 }}>
                  Crea una asesoría (título, imagen, descripción). Luego asigna esa asesoría a cada cliente y el contenido (semanas y sesiones) lo eliges en la ficha del cliente.
                </p>
              )}
              <button
                className="products-empty-button"
                onClick={handleNewProgram}
              >
                {productType === 'one_on_one' ? 'Crear asesoría' : 'Crear Programa'}
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
  );

  if (noLayout) return content;
  return (
    <DashboardLayout screenName="Productos">
      {content}
    </DashboardLayout>
  );
};

export default ProductsScreen;

