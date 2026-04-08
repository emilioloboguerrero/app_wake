// Tutorial endpoints not yet migrated to Phase 3 API.
// Returns empty results to avoid 404s. Re-enable when /users/me/tutorials is implemented.

class TutorialManager {
  async getTutorialsForScreen(_userId, _screenName, _programId = null) {
    return [];
  }

  async getProgramTutorials(_userId, _programId, _screenName) {
    return [];
  }

  async getGeneralTutorials(_userId, _screenName) {
    return [];
  }

  async markTutorialCompleted(_userId, _screenName, _videoUrl, _programId = null) {
    // no-op
  }

  async markProgramTutorialCompleted(_userId, _programId, _screenName, _videoUrl) {
    // no-op
  }

  async markGeneralTutorialCompleted(_userId, _screenName) {
    // no-op
  }

  async hasCompletedAllTutorials(_userId, _screenName, _programId = null) {
    return true;
  }
}

export default new TutorialManager();
