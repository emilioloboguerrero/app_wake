import React from 'react';
import Modal from './Modal';
import './EditScopeInfoModal.css';

/**
 * scope variants:
 *  - 'nutrition-assignment'  → editing a nutrition plan for a specific client
 *  - 'session-client'        → editing a session for a specific client
 *  - 'session-client-plan'   → editing a session within a client's program
 *  - 'plan-instance'         → editing a specific week of a plan
 */
const SCOPE_CONFIG = {
  'nutrition-assignment': {
    title: 'Editando plan de nutricion para un cliente',
    buildBody: ({ clientName, planName }) => (
      <>
        <p className="esim-paragraph">
          Estas editando el plan <strong>{planName || 'de nutricion'}</strong> solo para <strong>{clientName}</strong>. Cualquier cambio que hagas aqui aplica unicamente a este cliente.
        </p>
        <div className="esim-divider" />
        <p className="esim-paragraph">
          Los demas clientes que tengan asignado el mismo plan <strong>no se veran afectados</strong>.
        </p>
        <div className="esim-tip">
          <svg className="esim-tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Si quieres modificar el plan original para todos los clientes, ve a <strong>Biblioteca &gt; Nutricion</strong> y edita el plan desde ahi.</span>
        </div>
      </>
    )
  },
  'session-client': {
    title: 'Editando sesion para un cliente',
    buildBody: ({ clientName }) => (
      <>
        <p className="esim-paragraph">
          Estas personalizando esta sesion solo para <strong>{clientName}</strong>. Los cambios no afectan la sesion original en tu biblioteca.
        </p>
        <div className="esim-divider" />
        <p className="esim-paragraph">
          Otros clientes que usen esta misma sesion seguiran viendo la version de la biblioteca.
        </p>
        <div className="esim-tip">
          <svg className="esim-tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Para cambiar la sesion para todos los clientes, editala en <strong>Biblioteca &gt; Entrenamiento &gt; Sesiones</strong> y propaga los cambios.</span>
        </div>
      </>
    )
  },
  'session-client-plan': {
    title: 'Editando sesion dentro de un programa',
    buildBody: ({ clientName }) => (
      <>
        <p className="esim-paragraph">
          Estas editando esta sesion dentro del programa de <strong>{clientName}</strong>. Los cambios solo aplican a este cliente y esta semana.
        </p>
        <div className="esim-divider" />
        <p className="esim-paragraph">
          La sesion original en tu biblioteca y en los programas de otros clientes <strong>no cambiara</strong>.
        </p>
        <div className="esim-tip">
          <svg className="esim-tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Para cambiar la sesion para todos, editala en <strong>Biblioteca &gt; Entrenamiento &gt; Sesiones</strong> y propaga los cambios.</span>
        </div>
      </>
    )
  },
  'plan-instance': {
    title: 'Editando una semana del plan',
    buildBody: () => (
      <>
        <p className="esim-paragraph">
          Estas editando solo esta semana dentro del plan. Los cambios <strong>no afectan</strong> la sesion original en tu biblioteca ni otras semanas del plan.
        </p>
        <div className="esim-divider" />
        <p className="esim-paragraph">
          Cada semana puede tener su propia version de la sesion con ejercicios, series y cargas diferentes.
        </p>
        <div className="esim-tip">
          <svg className="esim-tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Para cambiar la sesion base, editala en <strong>Biblioteca &gt; Entrenamiento &gt; Sesiones</strong>.</span>
        </div>
      </>
    )
  }
};

const EditScopeInfoModal = ({ isOpen, onClose, scope, clientName, planName }) => {
  const config = SCOPE_CONFIG[scope];
  if (!config) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={config.title}>
      <div className="esim-body">
        {config.buildBody({ clientName, planName })}
      </div>
    </Modal>
  );
};

export default EditScopeInfoModal;
