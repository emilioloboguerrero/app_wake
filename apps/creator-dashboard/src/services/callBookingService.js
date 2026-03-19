import apiClient from '../utils/apiClient';

export async function getBookingsForCreator(_creatorId, opts = {}) {
  const params = {};
  if (opts.fromDate) params.date = opts.fromDate;
  const result = await apiClient.get('/creator/bookings', { params });
  let list = (result?.data ?? []).map((b) => ({ id: b.bookingId, ...b }));

  if (opts.status) {
    const statusLower = String(opts.status).toLowerCase();
    list = list.filter((b) => (b.status || '').toLowerCase() === statusLower);
  }
  if (opts.fromDate) {
    list = list.filter((b) => b.slotStartUtc >= opts.fromDate);
  }
  if (opts.toDate) {
    list = list.filter((b) => b.slotStartUtc <= opts.toDate);
  }

  return list;
}

export async function updateBookingCallLink(bookingId, callLink) {
  await apiClient.patch(`/creator/bookings/${bookingId}`, {
    callLink: callLink?.trim() || null,
  });
}
