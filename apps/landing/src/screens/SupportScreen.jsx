import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './SupportScreen.css';

const SupportScreen = () => {
  const [expandedFaq, setExpandedFaq] = useState(null);
  const supportEmail = 'emilioloboguerrero@gmail.com';

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const faqs = [
    {
      question: '¿Cómo puedo contactar al equipo de soporte?',
      answer: 'Puedes contactarnos enviando un correo electrónico a emilioloboguerrero@gmail.com. Nuestro equipo responderá en un plazo de 24-48 horas durante días hábiles.'
    },
    {
      question: '¿Cuál es el tiempo de respuesta del soporte?',
      answer: 'Nos comprometemos a responder todas las consultas en un plazo de 24-48 horas durante días hábiles (lunes a viernes). Para consultas urgentes, por favor indícalo en el asunto del correo.'
    },
    {
      question: '¿Cómo puedo cancelar mi suscripción?',
      answer: 'Para cancelar tu suscripción, puedes hacerlo directamente desde la aplicación en la sección de Configuración > Suscripciones, o contactarnos por correo electrónico y te ayudaremos con el proceso de cancelación.'
    },
    {
      question: '¿Ofrecen reembolsos?',
      answer: 'Sí, ofrecemos reembolsos según nuestra Política de Reembolsos. Para solicitar un reembolso, por favor contáctanos por correo electrónico con los detalles de tu compra. Puedes revisar nuestra política completa en la sección de Documentos Legales.'
    },
    {
      question: '¿Cómo puedo restablecer mi contraseña?',
      answer: 'Puedes restablecer tu contraseña desde la pantalla de inicio de sesión seleccionando "¿Olvidaste tu contraseña?". Si tienes problemas, contáctanos y te ayudaremos a recuperar el acceso a tu cuenta.'
    },
    {
      question: '¿Qué información debo incluir al reportar un problema?',
      answer: 'Para ayudarte de manera más eficiente, por favor incluye: (1) Descripción detallada del problema, (2) Sistema operativo y versión de la app, (3) Pasos para reproducir el problema, (4) Capturas de pantalla o videos si es posible.'
    },
    {
      question: '¿Cómo puedo actualizar mi información de pago?',
      answer: 'Puedes actualizar tu información de pago desde la aplicación en la sección de Configuración > Suscripciones. Si encuentras algún problema, contáctanos y te asistiremos con la actualización.'
    },
    {
      question: '¿La aplicación funciona sin conexión a internet?',
      answer: 'Algunas funcionalidades de Wake requieren conexión a internet para sincronizar datos y acceder a contenido. Sin embargo, puedes descargar programas y ejercicios para uso offline. Para más detalles, contáctanos.'
    }
  ];

  return (
    <div className="support-screen">
      <div className="support-container">
        {/* Hero Section */}
        <div className="support-hero">
          <h1 className="support-hero-title">Centro de Soporte Wake</h1>
          <p className="support-hero-subtitle">
            Estamos aquí para ayudarte. Encuentra respuestas a tus preguntas o contacta directamente
            con nuestro equipo de soporte.
          </p>
        </div>

        {/* Main Contact Section */}
        <div className="support-main-section">
          <div className="support-main-card">
            <div className="support-main-header">
              <h2 className="support-main-title">Contacto Directo</h2>
              <p className="support-main-description">
                Para consultas, asistencia técnica, preguntas sobre suscripciones, reembolsos,
                problemas con la cuenta o cualquier otra solicitud, puedes contactarnos directamente.
              </p>
            </div>

            <div className="support-contact-box">
              <div className="support-contact-label">Correo Electrónico de Soporte</div>
              <a
                href={`mailto:${supportEmail}?subject=Soporte Wake - Consulta`}
                className="support-contact-email"
              >
                {supportEmail}
              </a>
              <div className="support-contact-note">
                Haz clic en el correo para abrir tu cliente de email predeterminado
              </div>
            </div>

            <div className="support-info-grid">
              <div className="support-info-item">
                <div className="support-info-label">Tiempo de Respuesta</div>
                <div className="support-info-value">24-48 horas</div>
                <div className="support-info-detail">Días hábiles</div>
              </div>
              <div className="support-info-item">
                <div className="support-info-label">Horario de Atención</div>
                <div className="support-info-value">Lunes a Viernes</div>
                <div className="support-info-detail">9:00 AM - 6:00 PM</div>
              </div>
              <div className="support-info-item">
                <div className="support-info-label">Idiomas</div>
                <div className="support-info-value">Español</div>
                <div className="support-info-detail">Inglés disponible</div>
              </div>
            </div>
          </div>
        </div>

        {/* Support Topics Section */}
        <div className="support-topics-section">
          <h2 className="support-section-title">¿En qué podemos ayudarte?</h2>
          <div className="support-topics-grid">
            <div className="support-topic-card">
              <h3 className="support-topic-title">Asistencia Técnica</h3>
              <p className="support-topic-description">
                Problemas con la aplicación, errores, fallos, dificultades técnicas,
                problemas de sincronización o rendimiento.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Errores de la app</span>
                <span className="support-topic-tag">Problemas de inicio de sesión</span>
                <span className="support-topic-tag">Sincronización de datos</span>
              </div>
            </div>
            <div className="support-topic-card">
              <h3 className="support-topic-title">Suscripciones y Pagos</h3>
              <p className="support-topic-description">
                Consultas sobre planes, facturación, métodos de pago, actualización
                de información de pago, reembolsos y cancelaciones.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Gestión de suscripción</span>
                <span className="support-topic-tag">Problemas de pago</span>
                <span className="support-topic-tag">Reembolsos</span>
              </div>
            </div>
            <div className="support-topic-card">
              <h3 className="support-topic-title">Cuenta y Perfil</h3>
              <p className="support-topic-description">
                Ayuda con la gestión de tu cuenta, recuperación de contraseña,
                actualización de perfil, configuración de privacidad y seguridad.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Recuperar cuenta</span>
                <span className="support-topic-tag">Actualizar perfil</span>
                <span className="support-topic-tag">Configuración</span>
              </div>
            </div>
            <div className="support-topic-card">
              <h3 className="support-topic-title">Uso de la Aplicación</h3>
              <p className="support-topic-description">
                Guía sobre funcionalidades, características, cómo usar las herramientas,
                programas de entrenamiento y seguimiento de progreso.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Tutoriales</span>
                <span className="support-topic-tag">Funcionalidades</span>
                <span className="support-topic-tag">Guías de uso</span>
              </div>
            </div>
            <div className="support-topic-card">
              <h3 className="support-topic-title">Privacidad y Datos</h3>
              <p className="support-topic-description">
                Consultas sobre privacidad, tratamiento de datos personales,
                solicitudes de eliminación de datos y políticas de privacidad.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Privacidad</span>
                <span className="support-topic-tag">Datos personales</span>
                <span className="support-topic-tag">GDPR</span>
              </div>
            </div>
            <div className="support-topic-card">
              <h3 className="support-topic-title">Sugerencias y Feedback</h3>
              <p className="support-topic-description">
                Comparte tus ideas, comentarios, sugerencias para mejorar Wake,
                reportar bugs o solicitar nuevas funcionalidades.
              </p>
              <div className="support-topic-examples">
                <span className="support-topic-tag">Nuevas funciones</span>
                <span className="support-topic-tag">Mejoras</span>
                <span className="support-topic-tag">Reportar bugs</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="support-faq-section">
          <h2 className="support-section-title">Preguntas Frecuentes</h2>
          <p className="support-faq-intro">
            Encuentra respuestas rápidas a las preguntas más comunes sobre Wake.
          </p>
          <div className="support-faq-list">
            {faqs.map((faq, index) => (
              <div key={index} className="support-faq-item">
                <button
                  className="support-faq-question"
                  onClick={() => toggleFaq(index)}
                  aria-expanded={expandedFaq === index}
                >
                  <span>{faq.question}</span>
                  <span className="support-faq-icon">
                    {expandedFaq === index ? '−' : '+'}
                  </span>
                </button>
                {expandedFaq === index && (
                  <div className="support-faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div className="support-help-section">
          <h2 className="support-section-title">Cómo Agilizar tu Solicitud de Soporte</h2>
          <div className="support-help-content">
            <p className="support-help-text">
              Para brindarte una respuesta más rápida y precisa, por favor incluye la siguiente información en tu mensaje:
            </p>
            <div className="support-help-list">
              <div className="support-help-item">
                <span className="support-help-number">1</span>
                <div className="support-help-content-item">
                  <strong>Descripción detallada</strong>
                  <span>Explica claramente tu consulta o problema. Incluye contexto relevante y cualquier detalle que pueda ser útil.</span>
                </div>
              </div>
              <div className="support-help-item">
                <span className="support-help-number">2</span>
                <div className="support-help-content-item">
                  <strong>Información del dispositivo</strong>
                  <span>Sistema operativo (iOS/Android), versión del sistema, versión de la aplicación Wake, modelo del dispositivo.</span>
                </div>
              </div>
              <div className="support-help-item">
                <span className="support-help-number">3</span>
                <div className="support-help-content-item">
                  <strong>Pasos para reproducir</strong>
                  <span>Si es un problema técnico, describe los pasos exactos que llevan a reproducir el problema.</span>
                </div>
              </div>
              <div className="support-help-item">
                <span className="support-help-number">4</span>
                <div className="support-help-content-item">
                  <strong>Evidencia visual</strong>
                  <span>Adjunta capturas de pantalla, videos o cualquier otro material que ilustre el problema o la consulta.</span>
                </div>
              </div>
              <div className="support-help-item">
                <span className="support-help-number">5</span>
                <div className="support-help-content-item">
                  <strong>Información de cuenta</strong>
                  <span>Si es relevante, incluye tu email de cuenta (sin contraseña) y cualquier información de transacción si aplica.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Resources */}
        <div className="support-resources-section">
          <h2 className="support-section-title">Recursos Adicionales</h2>
          <div className="support-resources-grid">
            <Link to="/legal" className="support-resource-card">
              <h3 className="support-resource-title">Documentos Legales</h3>
              <p className="support-resource-description">
                Términos y condiciones, política de privacidad, política de reembolsos y otros documentos legales importantes.
              </p>
              <span className="support-resource-link">Ver documentos →</span>
            </Link>
            <a href="/creators/login" className="support-resource-card">
              <h3 className="support-resource-title">Panel de Creadores</h3>
              <p className="support-resource-description">
                Si eres creador de contenido, inicia sesión para acceder al panel de Wake Creadores.
              </p>
              <span className="support-resource-link">Iniciar sesión →</span>
            </a>
            <a href="/app" className="support-resource-card">
              <h3 className="support-resource-title">Abrir App (PWA)</h3>
              <p className="support-resource-description">
                Si ya eres usuario de Wake, accede a la aplicación para entrenar y seguir tu progreso.
              </p>
              <span className="support-resource-link">Abrir app →</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="support-footer">
          <div className="support-footer-content">
            <div className="support-footer-section">
              <h4 className="support-footer-title">Wake</h4>
              <p className="support-footer-description">
                Tu aplicación de entrenamiento personal donde mides lo que antes solo sentías.
              </p>
            </div>
            <div className="support-footer-section">
              <h4 className="support-footer-title">Enlaces Rápidos</h4>
              <div className="support-footer-links">
                <Link to="/legal" className="support-footer-link">Documentos Legales</Link>
                <a href="/app" className="support-footer-link">Abrir App</a>
                <a href="/creators/login" className="support-footer-link">Panel de Creadores</a>
                <a href={`mailto:${supportEmail}`} className="support-footer-link">Contacto</a>
              </div>
            </div>
            <div className="support-footer-section">
              <h4 className="support-footer-title">Soporte</h4>
              <div className="support-footer-contact">
                <a href={`mailto:${supportEmail}`} className="support-footer-email">
                  {supportEmail}
                </a>
                <p className="support-footer-hours">
                  Lunes a Viernes<br />
                  9:00 AM - 6:00 PM
                </p>
              </div>
            </div>
          </div>
          <div className="support-footer-bottom">
            <p className="support-footer-copyright">
              © 2025 Wake. Todos los derechos reservados.
            </p>
            <p className="support-footer-legal">
              <Link to="/legal" className="support-footer-link-small">Términos y Condiciones</Link>
              <span className="support-footer-separator">•</span>
              <Link to="/legal" className="support-footer-link-small">Política de Privacidad</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportScreen;
