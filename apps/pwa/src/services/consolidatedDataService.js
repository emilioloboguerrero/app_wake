// Minimal stub — legacy consolidatedDataService was removed during React Query migration.
// CourseDetailScreen still calls clearUserCache / clearAllCache on purchase;
// these are now no-ops since React Query manages cache invalidation.

class ConsolidatedDataService {
  clearUserCache() {}
  clearAllCache() {}
}

export default new ConsolidatedDataService();
