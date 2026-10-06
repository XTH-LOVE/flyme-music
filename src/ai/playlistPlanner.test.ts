import { describe, expect, it } from 'vitest';
import { planPlaylist } from './playlistPlanner';

describe('playlist planner', () => {
  it('creates a workout arc with exact duration', () => {
    const plan = planPlaylist('45分钟健身歌单');
    expect(plan.totalMinutes).toBe(45);
    expect(plan.goal).toBe('workout');
    expect(plan.stages.reduce((sum, stage) => sum + stage.minutes, 0)).toBe(45);
    expect(plan.stages.length).toBe(3);
  });

  it('understands study requests', () => {
    expect(planPlaylist('30分钟写代码').goal).toBe('study');
  });
});

