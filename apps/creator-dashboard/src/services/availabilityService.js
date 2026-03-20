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

/**
 * Replace all slots for a day with the provided list.
 * Deletes all existing slots for the day, then re-creates each slot individually.
 */
export async function setDaySlots(_creatorId, dateStr, slots, timezone) {
  const tz = timezone || getCreatorTimezone();
  const originalSlots = await getDaySlots(null, dateStr);
  await apiClient.delete('/creator/availability/slots', { params: { date: dateStr, startUtc: null } });
  try {
    for (const slot of slots) {
      const start = new Date(slot.startUtc);
      const end = new Date(slot.endUtc);
      const startH = start.getUTCHours();
      const startM = start.getUTCMinutes();
      const endH = end.getUTCHours();
      const endM = end.getUTCMinutes();
      const startTime = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      await apiClient.post('/creator/availability/slots', {
        date: dateStr,
        startTime,
        endTime,
        durationMinutes: slot.durationMinutes,
        timezone: tz,
      });
    }
  } catch (error) {
    try {
      await apiClient.delete('/creator/availability/slots', { params: { date: dateStr, startUtc: null } });
      for (const slot of originalSlots) {
        const start = new Date(slot.startUtc);
        const end = new Date(slot.endUtc);
        const startTime = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`;
        const endTime = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`;
        await apiClient.post('/creator/availability/slots', {
          date: dateStr,
          startTime,
          endTime,
          durationMinutes: slot.durationMinutes,
          timezone: tz,
        });
      }
    } catch (rollbackError) {
      console.error('[availabilityService] setDaySlots rollback failed:', rollbackError);
    }
    throw error;
  }
}

export default {
  getCreatorTimezone,
  getAvailability,
  getDaySlots,
  addSlotsForDay,
  deleteDaySlots,
  setDaySlots,
};
