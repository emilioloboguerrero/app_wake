// Centro de ayuda de la PWA — canal de soporte por WhatsApp (primario), correo,
// horario, temas frecuentes y FAQ. Alcanzado desde la fila "Soporte" en Perfil.
//
// No image on this screen → white-tone palette only, per docs/STANDARDS.md.
// The WhatsApp CTA is the single most critical target, so it renders opaque white.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';
import { queryKeys } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { whatsappUrl, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_EMAIL } from '../config/support';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const TOPICS = [
  {
    title: 'Asistencia técnica',
    description: 'Errores de la app, inicio de sesión, sincronización de datos o rendimiento.',
  },
  {
    title: 'Suscripciones y pagos',
    description: 'Planes, facturación, métodos de pago, reembolsos y cancelaciones.',
  },
  {
    title: 'Cuenta y perfil',
    description: 'Recuperar tu cuenta, actualizar tu perfil o cambiar tu configuración.',
  },
  {
    title: 'Uso de la app',
    description: 'Cómo usar tus programas, registrar entrenamientos y seguir tu progreso.',
  },
];

const FAQS = [
  {
    question: '¿Cómo contacto al equipo de soporte?',
    answer: 'La vía más rápida es WhatsApp al +57 313 4950869: te respondemos directo desde el chat. También puedes escribirnos por correo a emilioloboguerrero@gmail.com, donde respondemos en 24-48 horas durante días hábiles.',
  },
  {
    question: '¿Cuál es el tiempo de respuesta?',
    answer: 'Respondemos todas las consultas en 24-48 horas durante días hábiles (lunes a viernes). Para algo urgente, indícalo al inicio de tu mensaje.',
  },
  {
    question: '¿Cómo cancelo mi suscripción?',
    answer: 'Puedes cancelar desde la app en la sección de Suscripciones, o escríbenos y te ayudamos con el proceso.',
  },
  {
    question: '¿Ofrecen reembolsos?',
    answer: 'Sí, según nuestra Política de Reembolsos. Para solicitar uno, escríbenos con los detalles de tu compra. Puedes revisar la política completa en los Documentos Legales.',
  },
  {
    question: '¿Cómo restablezco mi contraseña?',
    answer: 'Desde la pantalla de inicio de sesión, selecciona "¿Olvidaste tu contraseña?". Si tienes problemas, escríbenos y te ayudamos a recuperar el acceso.',
  },
  {
    question: '¿Qué información incluir al reportar un problema?',
    answer: 'Para ayudarte más rápido, incluye: (1) descripción detallada del problema, (2) tu dispositivo y versión de la app, (3) los pasos para reproducirlo, y (4) capturas o videos si es posible.',
  },
  {
    question: '¿Cómo actualizo mi información de pago?',
    answer: 'Desde la app, en la sección de Suscripciones. Si encuentras algún problema, escríbenos y te asistimos con la actualización.',
  },
  {
    question: '¿La app funciona sin conexión?',
    answer: 'Algunas funciones requieren conexión para sincronizar datos y acceder a contenido. Puedes descargar programas para uso offline. Para más detalles, escríbenos.',
  },
];

const styles = {
  page: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: '#fff',
    padding: '60px 24px 100px',
    boxSizing: 'border-box',
  },
  inner: {
    maxWidth: 540,
    margin: '0 auto',
  },
  backButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    padding: '8px 0',
    marginBottom: 24,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  heading: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.3,
    lineHeight: 1.15,
    margin: '0 0 24px',
  },
  whatsappButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    textAlign: 'center',
    padding: '18px 24px',
    borderRadius: 14,
    background: '#ffffff',
    color: '#1a1a1a',
    textDecoration: 'none',
    boxSizing: 'border-box',
    transition: `opacity 160ms ${SPRING}, transform 120ms ${SPRING}`,
  },
  whatsappLabel: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  whatsappNumber: {
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(26,26,26,0.6)',
  },
  emailButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    textAlign: 'center',
    padding: '16px 24px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.65)',
    textDecoration: 'none',
    boxSizing: 'border-box',
    marginTop: 12,
    transition: `background-color 160ms ${SPRING}, border-color 160ms ${SPRING}`,
  },
  emailLabel: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.5)',
  },
  emailValue: {
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.8)',
  },
  infoRow: {
    display: 'flex',
    gap: 12,
    marginTop: 20,
  },
  infoCell: {
    flex: 1,
    padding: '14px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.2,
    color: '#fff',
    margin: '44px 0 16px',
  },
  topicList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  topicCard: {
    padding: '16px 18px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: -0.1,
    color: '#fff',
    marginBottom: 4,
  },
  topicDescription: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.45,
    color: 'rgba(255,255,255,0.5)',
  },
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  faqItem: {
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  faqQuestion: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    padding: '16px 18px',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  faqIcon: {
    flexShrink: 0,
    fontSize: 20,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1,
  },
  faqAnswer: {
    padding: '0 18px 16px',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.6)',
  },
};

export default function SupportScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    document.title = 'Soporte — Wake';
  }, []);

  const { data: profile } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => apiClient.get('/users/me').then((r) => r.data),
    enabled: !!user?.uid,
    staleTime: STALE_TIMES.userProfile,
    gcTime: GC_TIMES.userProfile,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const name = profile?.displayName?.trim();
  const prefill = name
    ? `Hola, soy ${name}. Necesito ayuda con Wake.`
    : 'Hola, necesito ayuda con Wake.';

  return (
    <div className="wake-screen-enter" style={styles.page}>
      <div style={styles.inner}>
        <button style={styles.backButton} onClick={() => navigate(-1)}>
          ← Volver
        </button>

        <h1 style={styles.heading}>Soporte</h1>

        <a
          href={whatsappUrl(prefill)}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.whatsappButton}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <span style={styles.whatsappLabel}>Escríbenos por WhatsApp</span>
          <span style={styles.whatsappNumber}>{SUPPORT_WHATSAPP_DISPLAY}</span>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Soporte Wake - Consulta`}
          style={styles.emailButton}
        >
          <span style={styles.emailLabel}>O escríbenos por correo</span>
          <span style={styles.emailValue}>{SUPPORT_EMAIL}</span>
        </a>

        <div style={styles.infoRow}>
          <div style={styles.infoCell}>
            <div style={styles.infoLabel}>Respuesta</div>
            <div style={styles.infoValue}>24-48 horas</div>
          </div>
          <div style={styles.infoCell}>
            <div style={styles.infoLabel}>Horario</div>
            <div style={styles.infoValue}>L-V · 9:00-18:00</div>
          </div>
        </div>

        <h2 style={styles.sectionTitle}>¿En qué podemos ayudarte?</h2>
        <div style={styles.topicList}>
          {TOPICS.map((topic) => (
            <div key={topic.title} style={styles.topicCard}>
              <div style={styles.topicTitle}>{topic.title}</div>
              <div style={styles.topicDescription}>{topic.description}</div>
            </div>
          ))}
        </div>

        <h2 style={styles.sectionTitle}>Preguntas frecuentes</h2>
        <div style={styles.faqList}>
          {FAQS.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div key={faq.question} style={styles.faqItem}>
                <button
                  style={styles.faqQuestion}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <span style={styles.faqIcon}>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && <div style={styles.faqAnswer}>{faq.answer}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
