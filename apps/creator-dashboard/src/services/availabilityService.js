import apiClient from '../utils/apiClient';

export function getCreatorTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

export async function getAvailability() {
  const result = await apiClient.get('/creator/availability');
  return result?.data ?? {
    timezone: getCreatorTimezone(),
    days: {},
    weeklyTemplate: {},
    disabledDates: [],
    defaultSlotDuration: 45,
  };
}

export async function saveWeeklyTemplate(weeklyTemplate, disabledDates, defaultSlotDuration) {
  const tz = getCreatorTimezone();
  await apiClient.put('/creator/availability/template', {
    weeklyTemplate,
    disabledDates,
    defaultSlotDuration,
    timezone: tz,
  });
}

export default {
  getCreatorTimezone,
  getAvailability,
  saveWeeklyTemplate,
};
