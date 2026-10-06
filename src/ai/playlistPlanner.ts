export type PlaylistGoal = 'workout' | 'study' | 'sleep' | 'commute' | 'dinner' | 'focus' | 'freeform';

export interface PlaylistStage {
  id: string;
  label: string;
  minutes: number;
  tempo: 'slow' | 'medium' | 'fast';
  energy: 'low' | 'medium' | 'high';
  queryHints: string[];
}

export interface PlaylistPlan {
  goal: PlaylistGoal;
  totalMinutes: number;
  stages: PlaylistStage[];
  explanation: string;
}

function goalOf(text: string): PlaylistGoal {
  const lower = text.toLowerCase();
  if (/运动|健身|workout|gym|跑步|训练/.test(lower)) return 'workout';
  if (/学习|专注|工作|coding|study|focus|写代码/.test(lower)) return 'study';
  if (/睡眠|助眠|sleep|冥想|晚安/.test(lower)) return 'sleep';
  if (/通勤|开车|commute|drive/.test(lower)) return 'commute';
  if (/晚餐|dinner|聚会/.test(lower)) return 'dinner';
  return 'freeform';
}

function minutesOf(text: string, fallback: number): number {
  const match = text.match(/(\d{1,3})\s*(?:分钟|分|min(?:ute)?s?)/i);
  return Math.max(1, Math.min(240, match ? Number(match[1]) : fallback));
}

function stage(id: string, label: string, minutes: number, tempo: PlaylistStage['tempo'], energy: PlaylistStage['energy'], ...queryHints: string[]): PlaylistStage {
  return { id, label, minutes: Math.max(1, minutes), tempo, energy, queryHints };
}

export function planPlaylist(text: string, fallbackMinutes = 45): PlaylistPlan {
  const totalMinutes = minutesOf(text, fallbackMinutes);
  const goal = goalOf(text);
  let stages: PlaylistStage[];
  if (goal === 'workout') {
    const warm = Math.max(1, Math.round(totalMinutes * 0.22));
    const peak = Math.max(1, Math.round(totalMinutes * 0.58));
    stages = [stage('warmup', '热身', warm, 'medium', 'medium', 'warmup', '渐进'), stage('peak', '主训练', peak, 'fast', 'high', 'energetic', 'upbeat'), stage('cooldown', '冷却', totalMinutes - warm - peak, 'slow', 'low', '放松', 'cooldown')];
  } else if (goal === 'study') {
    const settle = Math.max(1, Math.round(totalMinutes * 0.25));
    stages = [stage('settle', '进入状态', settle, 'slow', 'low', 'ambient', 'instrumental'), stage('deep', '深度专注', totalMinutes - settle, 'medium', 'low', 'focus', 'minimal', '纯音乐')];
  } else if (goal === 'sleep') {
    const settle = Math.max(1, Math.round(totalMinutes * 0.35));
    stages = [stage('settle', '放松', settle, 'slow', 'low', 'calm', 'ambient'), stage('drift', '入睡', totalMinutes - settle, 'slow', 'low', 'sleep', 'soft', '无鼓点')];
  } else if (goal === 'commute') {
    stages = [stage('start', '出发', Math.max(1, Math.round(totalMinutes * 0.25)), 'medium', 'medium', 'bright'), stage('cruise', '路上', Math.max(1, Math.round(totalMinutes * 0.55)), 'medium', 'high', 'driving'), stage('arrive', '收尾', totalMinutes - Math.max(1, Math.round(totalMinutes * 0.25)) - Math.max(1, Math.round(totalMinutes * 0.55)), 'slow', 'medium', 'arrival')];
  } else {
    stages = [stage('main', '主段', totalMinutes, 'medium', 'medium', text.trim() || '随心')];
  }
  let remaining = totalMinutes - stages.reduce((sum, item) => sum + item.minutes, 0);
  for (let i = stages.length - 1; remaining !== 0 && i >= 0; i -= 1) {
    const next = Math.max(1, stages[i].minutes + remaining);
    remaining -= next - stages[i].minutes;
    stages[i] = { ...stages[i], minutes: next };
  }
  return { goal, totalMinutes, stages, explanation: '按目标、时长和能量曲线分段，再从候选池中填充歌曲。' };
}

export function stageQuery(plan: PlaylistPlan, stageItem: PlaylistStage, extra = ''): string {
  return [plan.goal, stageItem.label, stageItem.tempo, stageItem.energy, ...stageItem.queryHints, extra].filter(Boolean).join(' ');
}
