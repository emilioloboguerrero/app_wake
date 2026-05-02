// Reads today's nutrition plan + diary entries and returns summary numbers for the Hoy preview
// nutrition card. Shares the React Query keys NutritionScreen + MainScreen use, so cache is reused
// (and so cache updates trigger re-renders here).
//
// hasNutrition detection mirrors HoyScreen.web.jsx handleTapCourse:
//   profile.pinnedNutritionAssignmentId  OR  ['nutrition','has-assignment',uid] fallback  OR  loaded plan.
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import apiClient from '../../utils/apiClient';
import { firestore } from '../../config/firebase';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import * as nutritionDb from '../../services/nutritionFirestoreService';

// API doesn't surface the assignment's creator_id — we read it directly from Firestore.
// Security rules allow the assignee (userId == auth.uid) to read the nutrition_assignment doc.
const fetchAssignmentCreatorId = async (assignmentId) => {
  if (!assignmentId) return null;
  try {
    const snap = await getDoc(doc(firestore, 'nutrition_assignments', assignmentId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return d.creator_id || d.creatorId || d.assignedBy || null;
  } catch {
    return null;
  }
};

const todayYYYYMMDD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sumDiary = (entries) => {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  (entries || []).forEach((e) => {
    calories += Number(e.calories) || 0;
    protein += Number(e.protein) || 0;
    carbs += Number(e.carbs) || 0;
    fat += Number(e.fat) || 0;
  });
  return { calories, protein, carbs, fat };
};

const pickPlanName = (plan, assignment) => (
  assignment?.planTitle ||
  assignment?.title ||
  plan?.name ||
  plan?.title ||
  null
);

export function useNutritionToday(userId) {
  const today = todayYYYYMMDD();

  // Subscribe to the user profile (same key useUserCourses uses — shared cache, no double fetch).
  // pinnedNutritionAssignmentId is auto-healed server-side in /users/me, so for any user with an
  // active assignment this resolves to a truthy id once /users/me lands.
  const { data: profile } = useQuery({
    queryKey: queryKeys.user.detail(userId),
    queryFn: () => apiClient.get('/users/me').then((r) => r?.data ?? null),
    enabled: !!userId,
    ...cacheConfig.userProfile,
  });
  const pinnedAssignmentId = profile?.pinnedNutritionAssignmentId || null;

  // Fallback existence probe — same key MainScreen prefetches under, so cache is shared.
  // Only fires when the profile flag is missing (e.g. legacy doc without auto-heal applied yet).
  const { data: hasAssignmentFallback } = useQuery({
    queryKey: ['nutrition', 'has-assignment', userId],
    queryFn: async () => {
      try {
        await apiClient.get('/nutrition/assignment', { params: { date: today } });
        return true;
      } catch {
        return false;
      }
    },
    enabled: !!userId && !pinnedAssignmentId,
    staleTime: 5 * 60 * 1000,
  });

  const planQuery = useQuery({
    queryKey: ['nutrition', 'plan', userId, today, pinnedAssignmentId],
    queryFn: async () => {
      const dateForPlan = new Date(`${today}T12:00:00`);
      const result = pinnedAssignmentId
        ? await nutritionDb.getPlanForAssignmentId(userId, pinnedAssignmentId, dateForPlan)
        : await nutritionDb.getEffectivePlanForUser(userId, dateForPlan);
      return { plan: result?.plan ?? null, assignment: result?.assignment ?? null };
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  const diaryQuery = useQuery({
    queryKey: ['nutrition', 'diary', userId, today],
    queryFn: () => nutritionDb.getDiaryEntries(userId, today),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  const plan = planQuery.data?.plan ?? null;
  const assignment = planQuery.data?.assignment ?? null;
  const consumed = sumDiary(diaryQuery.data);

  const hasNutrition = !!pinnedAssignmentId || hasAssignmentFallback === true || !!plan;

  // creator_id of who assigned this nutrition — used by HoyPreviewScreen to attach the
  // nutrition card to the right coach environment. The /nutrition/assignment API doesn't
  // include creator_id, so we read it directly from the Firestore doc.
  const effectiveAssignmentId = pinnedAssignmentId || assignment?.id || null;
  const { data: assignmentCreatorId } = useQuery({
    queryKey: ['preview', 'nutrition-assignment-creator', effectiveAssignmentId],
    queryFn: () => fetchAssignmentCreatorId(effectiveAssignmentId),
    enabled: !!effectiveAssignmentId,
    staleTime: 60 * 60 * 1000,
  });

  return {
    hasNutrition,
    assignmentCreatorId: assignmentCreatorId || null,
    nutritionPlanName: pickPlanName(plan, assignment),
    caloriesTarget: Number(plan?.daily_calories) || 0,
    proteinTarget: Number(plan?.daily_protein_g) || Number(plan?.daily_protein) || 0,
    carbsTarget: Number(plan?.daily_carbs_g) || Number(plan?.daily_carbs) || 0,
    fatTarget: Number(plan?.daily_fat_g) || Number(plan?.daily_fat) || 0,
    caloriesConsumed: consumed.calories,
    proteinConsumed: consumed.protein,
    carbsConsumed: consumed.carbs,
    fatConsumed: consumed.fat,
    isLoading: planQuery.isLoading || diaryQuery.isLoading,
  };
}
