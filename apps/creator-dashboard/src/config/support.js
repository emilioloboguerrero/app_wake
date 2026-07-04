// Soporte por WhatsApp — fuente única de verdad para el canal de soporte.
// Número en formato internacional (sin +, sin espacios). Cambiar aquí lo cambia en toda la app.
export const SUPPORT_WHATSAPP = '573178751956';
export const SUPPORT_WHATSAPP_DISPLAY = '+57 317 8751956';
export const SUPPORT_EMAIL = 'soporte@wakelab.co';

export function whatsappUrl(prefill) {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base;
}
