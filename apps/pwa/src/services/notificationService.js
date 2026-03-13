// Notification service stub — FCM is not active on web PWA.
// notificationUtils.js imports this service; these are no-ops until FCM is implemented.

class NotificationService {
  async initialize() {}
  setUserId(_userId) {}
  async getStoredToken() { return null; }
}

export default new NotificationService();
