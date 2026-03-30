import { formatLastCompletedLabel, getRecommendedPlanDayId } from './recommendation';

describe('workout plan session recommendation', () => {
  it('recommends first session when there is no completed history', () => {
    const recommended = getRecommendedPlanDayId({
      days: [{ id: 'day-1' }, { id: 'day-2' }],
      mostRecentCompletedDayId: null,
    });

    expect(recommended).toBe('day-1');
  });

  it('recommends session after latest completed session', () => {
    const recommended = getRecommendedPlanDayId({
      days: [{ id: 'day-1' }, { id: 'day-2' }, { id: 'day-3' }],
      mostRecentCompletedDayId: 'day-1',
    });

    expect(recommended).toBe('day-2');
  });

  it('wraps around from last day to first day', () => {
    const recommended = getRecommendedPlanDayId({
      days: [{ id: 'day-1' }, { id: 'day-2' }, { id: 'day-3' }],
      mostRecentCompletedDayId: 'day-3',
    });

    expect(recommended).toBe('day-1');
  });

  it('only counts same-plan completion by ignoring completed day ids outside current order', () => {
    const recommended = getRecommendedPlanDayId({
      days: [{ id: 'plan-1-day-1' }, { id: 'plan-1-day-2' }],
      mostRecentCompletedDayId: 'plan-2-day-9',
    });

    expect(recommended).toBe('plan-1-day-1');
  });

  it('in-progress day overrides recommendation', () => {
    const recommended = getRecommendedPlanDayId({
      days: [{ id: 'day-1' }, { id: 'day-2' }],
      mostRecentCompletedDayId: 'day-1',
      inProgressDayId: 'day-1',
    });

    expect(recommended).toBe('day-1');
  });

  it('renders never completed helper text when timestamp is missing', () => {
    expect(formatLastCompletedLabel(null)).toBe('Never completed');
  });
});
