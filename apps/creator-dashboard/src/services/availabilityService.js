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
  return result?.data ?? { timezone: getCreatorTimezone(), days: {} };
}

export async function getDaySlots(_creatorId, dateStr) {
  const avail = await getAvailability();
  return (avail.days?.[dateStr]?.slots ?? []).slice();
}

function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function addSlotsForDay(_creatorId, dateStr, startMinutes, endMinutes, durationMinutes, timezone) {
  const tz = timezone || getCreatorTimezone();
  const result = await apiClient.post('/creator/availability/slots', {
    date: dateStr,
    startTime: minutesToHHMM(startMinutes),
    endTime: minutesToHHMM(endMinutes),
    durationMinutes,
    timezone: tz,
  });
  return result?.data?.slotsCreated ?? 0;
}

export async function deleteDaySlots(_creatorId, dateStr, startUtc = null) {
  const params = { date: dateStr };
  if (startUtc != null) params.startUtc = startUtc;
  await apiClient.delete('/creator/availability/slots', { params });
}

export default {
  getCreatorTimezone,
  getAvailability,
  getDaySlots,
  addSlotsForDay,
  deleteDaySlots,
};
