type PlanDay = {
  id: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;

export function getRecommendedPlanDayId(input: {
  days: PlanDay[];
  mostRecentCompletedDayId: string | null;
  inProgressDayId?: string | null;
}): string | null {
  const { days, mostRecentCompletedDayId, inProgressDayId = null } = input;
  if (days.length === 0) return null;

  const inProgressIndex = inProgressDayId
    ? days.findIndex((day) => day.id === inProgressDayId)
    : -1;
  if (inProgressIndex >= 0) return days[inProgressIndex].id;

  const completedIndex = mostRecentCompletedDayId
    ? days.findIndex((day) => day.id === mostRecentCompletedDayId)
    : -1;
  if (completedIndex < 0) return days[0].id;

  return days[(completedIndex + 1) % days.length].id;
}

export function formatLastCompletedLabel(lastCompletedAt: string | null, now = new Date()): string {
  if (!lastCompletedAt) return 'Never completed';

  const completedDate = new Date(lastCompletedAt);
  if (Number.isNaN(completedDate.getTime())) return 'Never completed';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfCompleted = new Date(
    completedDate.getFullYear(),
    completedDate.getMonth(),
    completedDate.getDate(),
  );
  const diffDays = Math.round((startOfToday.getTime() - startOfCompleted.getTime()) / DAY_MS);

  if (diffDays <= 0) return 'Last completed today';
  if (diffDays === 1) return 'Last completed yesterday';
  return `Last completed ${diffDays} days ago`;
}
