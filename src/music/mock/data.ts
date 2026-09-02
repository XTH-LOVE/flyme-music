import type { Album, Artist, Chart, Lyrics, Playlist, Song } from '../types';

/* All names, artworks (gradients) and lyrics below are original mock content. */

export const mockArtists: Artist[] = [
  { id: 'ar-1', name: '夜航星', palette: ['#3D7BFF', '#7FB0FF'], bio: '电子氛围音乐人，擅长用合成器描绘夜晚的城市光谱。', followers: 1284000 },
  { id: 'ar-2', name: '林间回声', palette: ['#2FA96B', '#8AD9A8'], bio: '独立民谣组合，声音里有清晨的森林与露水。', followers: 862000 },
  { id: 'ar-3', name: '白鹭乐队', palette: ['#F2A65A', '#FFD8A8'], bio: '城市流行四人组，节奏轻盈，像傍晚的海风。', followers: 2030000 },
  { id: 'ar-4', name: '云岛', palette: ['#9C6BFF', '#D4B8FF'], bio: '梦幻流行制作人，把云层的高度写进旋律。', followers: 596000 },
  { id: 'ar-5', name: '顾晚舟', palette: ['#E86A8A', '#FFB8C8'], bio: '唱作人，歌词像一封封没有寄出的信。', followers: 1750000 },
  { id: 'ar-6', name: '脉冲工厂', palette: ['#00B8B0', '#8CE8E2'], bio: '工业电子双人组，节拍是机器的呼吸。', followers: 431000 },
];

export const mockAlbums: Album[] = [
  { id: 'al-1', title: '夜光航线', artistId: 'ar-1', artistName: '夜航星', year: 2025, palette: ['#2C5FD8', '#7FB0FF'], description: '一张关于夜间航班的概念专辑，十段旋律对应十段航程。' },
  { id: 'al-2', title: '清晨采集', artistId: 'ar-2', artistName: '林间回声', year: 2024, palette: ['#2FA96B', '#B8E8C8'], description: '在森林里录制的民谣集，保留了风声与鸟鸣。' },
  { id: 'al-3', title: '海岸线电台', artistId: 'ar-3', artistName: '白鹭乐队', year: 2025, palette: ['#F2A65A', '#FFE8C8'], description: '适合开车时播放的城市流行，窗边是流动的海岸。' },
  { id: 'al-4', title: '云层图鉴', artistId: 'ar-4', artistName: '云岛', year: 2024, palette: ['#7B4FE0', '#D4B8FF'], description: '每一种云都有一段旋律，梦幻流行作品集。' },
  { id: 'al-5', title: '未寄出的信', artistId: 'ar-5', artistName: '顾晚舟', year: 2025, palette: ['#D85A7A', '#FFC8D4'], description: '十封信，十首歌，写给过去的人。' },
  { id: 'al-6', title: '机器心跳', artistId: 'ar-6', artistName: '脉冲工厂', year: 2023, palette: ['#009A93', '#8CE8E2'], description: '工业电子与人类心跳的对照实验。' },
];

export const mockSongs: Song[] = [
  { id: 's-01', title: '夜光航线', artistId: 'ar-1', artistName: '夜航星', albumId: 'al-1', albumName: '夜光航线', duration: 238, palette: ['#2C5FD8', '#7FB0FF'] },
  { id: 's-02', title: '舷窗', artistId: 'ar-1', artistName: '夜航星', albumId: 'al-1', albumName: '夜光航线', duration: 196, palette: ['#2C5FD8', '#7FB0FF'] },
  { id: 's-03', title: '平流层', artistId: 'ar-1', artistName: '夜航星', albumId: 'al-1', albumName: '夜光航线', duration: 264, palette: ['#2C5FD8', '#7FB0FF'] },
  { id: 's-04', title: '露水邮局', artistId: 'ar-2', artistName: '林间回声', albumId: 'al-2', albumName: '清晨采集', duration: 212, palette: ['#2FA96B', '#B8E8C8'] },
  { id: 's-05', title: '桦木与风', artistId: 'ar-2', artistName: '林间回声', albumId: 'al-2', albumName: '清晨采集', duration: 187, palette: ['#2FA96B', '#B8E8C8'] },
  { id: 's-06', title: '苔原慢车', artistId: 'ar-2', artistName: '林间回声', albumId: 'al-2', albumName: '清晨采集', duration: 245, palette: ['#2FA96B', '#B8E8C8'] },
  { id: 's-07', title: '海岸线电台', artistId: 'ar-3', artistName: '白鹭乐队', albumId: 'al-3', albumName: '海岸线电台', duration: 221, palette: ['#F2A65A', '#FFE8C8'] },
  { id: 's-08', title: '傍晚七点的风', artistId: 'ar-3', artistName: '白鹭乐队', albumId: 'al-3', albumName: '海岸线电台', duration: 203, palette: ['#F2A65A', '#FFE8C8'] },
  { id: 's-09', title: '环岛公路', artistId: 'ar-3', artistName: '白鹭乐队', albumId: 'al-3', albumName: '海岸线电台', duration: 254, palette: ['#F2A65A', '#FFE8C8'] },
  { id: 's-10', title: '积雨云', artistId: 'ar-4', artistName: '云岛', albumId: 'al-4', albumName: '云层图鉴', duration: 232, palette: ['#7B4FE0', '#D4B8FF'] },
  { id: 's-11', title: '卷云素描', artistId: 'ar-4', artistName: '云岛', albumId: 'al-4', albumName: '云层图鉴', duration: 178, palette: ['#7B4FE0', '#D4B8FF'] },
  { id: 's-12', title: '云海日落', artistId: 'ar-4', artistName: '云岛', albumId: 'al-4', albumName: '云层图鉴', duration: 289, palette: ['#7B4FE0', '#D4B8FF'] },
  { id: 's-13', title: '未寄出的信', artistId: 'ar-5', artistName: '顾晚舟', albumId: 'al-5', albumName: '未寄出的信', duration: 247, palette: ['#D85A7A', '#FFC8D4'] },
  { id: 's-14', title: '第七页', artistId: 'ar-5', artistName: '顾晚舟', albumId: 'al-5', albumName: '未寄出的信', duration: 215, palette: ['#D85A7A', '#FFC8D4'] },
  { id: 's-15', title: '站台', artistId: 'ar-5', artistName: '顾晚舟', albumId: 'al-5', albumName: '未寄出的信', duration: 268, palette: ['#D85A7A', '#FFC8D4'] },
  { id: 's-16', title: '机器心跳', artistId: 'ar-6', artistName: '脉冲工厂', albumId: 'al-6', albumName: '机器心跳', duration: 226, palette: ['#009A93', '#8CE8E2'] },
  { id: 's-17', title: '流水线之梦', artistId: 'ar-6', artistName: '脉冲工厂', albumId: 'al-6', albumName: '机器心跳', duration: 241, palette: ['#009A93', '#8CE8E2'] },
  { id: 's-18', title: '电压情书', artistId: 'ar-6', artistName: '脉冲工厂', albumId: 'al-6', albumName: '机器心跳', duration: 199, palette: ['#009A93', '#8CE8E2'] },
];

export const mockPlaylists: Playlist[] = [
  { id: 'pl-1', title: '深夜飞行模式', description: '适合独处时的电子氛围，把城市调成静音。', palette: ['#3D5FD8', '#8FB0FF'], songIds: ['s-01', 's-02', 's-03', 's-10', 's-12'], plays: 1280000 },
  { id: 'pl-2', title: '清晨的第一缕光', description: '用民谣叫醒耳朵，比咖啡更温和。', palette: ['#2FA96B', '#A8E8C0'], songIds: ['s-04', 's-05', 's-06', 's-11'], plays: 860000 },
  { id: 'pl-3', title: '沿海公路自驾', description: '车窗降下来，音量升上去。', palette: ['#F2A65A', '#FFD8A0'], songIds: ['s-07', 's-08', 's-09', 's-16'], plays: 2150000 },
  { id: 'pl-4', title: '云层之上', description: '梦幻流行，适合望着窗外发呆。', palette: ['#7B4FE0', '#C8A8FF'], songIds: ['s-10', 's-11', 's-12', 's-02'], plays: 640000 },
  { id: 'pl-5', title: '写不完的备忘录', description: '关于想念的一些旋律。', palette: ['#D85A7A', '#FFB8C8'], songIds: ['s-13', 's-14', 's-15', 's-04'], plays: 1720000 },
  { id: 'pl-6', title: '赛博健身房', description: '工业电子，让节拍替你数拍子。', palette: ['#009A93', '#80E0D8'], songIds: ['s-16', 's-17', 's-18', 's-09'], plays: 430000 },
  { id: 'pl-7', title: '通勤降噪', description: '地铁十分钟，听完一首完整的歌。', palette: ['#5A6AD8', '#A8B8FF'], songIds: ['s-11', 's-05', 's-14', 's-08'], plays: 980000 },
  { id: 'pl-8', title: '周末慢速播放', description: '把倍速关掉，把周末还给耳朵。', palette: ['#C87A4F', '#F2C8A0'], songIds: ['s-06', 's-12', 's-15', 's-01'], plays: 550000 },
];

export const mockCharts: Chart[] = [
  { id: 'ch-1', title: '极光热歌榜', subtitle: '每周更新 · 全站热度', palette: ['#FF6A5A', '#FFB0A0'], songIds: ['s-07', 's-13', 's-01', 's-04', 's-16', 's-10'] },
  { id: 'ch-2', title: '新歌首发榜', subtitle: '本周新发行', palette: ['#3D7BFF', '#9CB8FF'], songIds: ['s-09', 's-12', 's-18', 's-14', 's-03'] },
  { id: 'ch-3', title: '独立原创榜', subtitle: '来自独立音乐人', palette: ['#8A5AE0', '#C8A8FF'], songIds: ['s-05', 's-11', 's-17', 's-15', 's-02'] },
];

export const mockHotKeywords = [
  '夜航星',
  '海岸线电台',
  '梦幻流行',
  '未寄出的信',
  '通勤歌单',
  '城市流行',
  '清晨民谣',
  '工业电子',
];

export const mockLyricsMap: Record<string, Lyrics> = {
  's-01': [
    { time: 0, text: '（前奏）' },
    { time: 8, text: '起飞前的城市 收起了灯火' },
    { time: 16, text: '我把舷窗打开 接住一整条银河' },
    { time: 24, text: '夜光铺成航线 云是沉默的海' },
    { time: 32, text: '耳机里的脉冲 替我数着心跳的节拍' },
    { time: 42, text: '飞吧 穿过平流层的白' },
    { time: 50, text: '飞吧 把喧嚣留在云海' },
    { time: 58, text: '远方的信号灯 一闪一灭像在说 晚安' },
    { time: 68, text: '（间奏）' },
    { time: 78, text: '三万英尺之上 烦恼很轻' },
    { time: 86, text: '星光落在机翼 像一场安静的掌声' },
    { time: 96, text: '飞吧 穿过平流层的白' },
    { time: 104, text: '飞吧 把日子过成航线' },
    { time: 114, text: '落地之前 请允许我 再做一个梦' },
    { time: 126, text: '（尾奏）' },
  ],
  's-07': [
    { time: 0, text: '（前奏）' },
    { time: 6, text: '海岸线的电台 播放着夏天' },
    { time: 14, text: '信号灯眨着眼 替浪花数拍点' },
    { time: 22, text: '把车窗降下来 让风坐进来' },
    { time: 30, text: '旋律绕着环岛路 一圈又一圈' },
    { time: 40, text: '哦 傍晚七点的风 刚好吹散疲倦' },
    { time: 48, text: '哦 音量不用太大 听得见海就行' },
    { time: 58, text: '（间奏）' },
    { time: 68, text: '电台里的老歌 替我们怀念' },
    { time: 76, text: '那些没说出口的话 都变成了和弦' },
    { time: 86, text: '哦 傍晚七点的风 刚好吹散疲倦' },
    { time: 94, text: '哦 路还很长 我们慢慢开' },
    { time: 106, text: '（尾奏）' },
  ],
};

/** Generic fallback lyrics generated for songs without authored lyrics. */
export function fallbackLyrics(song: Song): Lyrics {
  const lines = [
    '（前奏）',
    song.title + ' 在耳边慢慢展开',
    '像一阵 不期而遇的风',
    '把今天的心事 都轻轻吹开',
    '（间奏）',
    '如果旋律有颜色',
    '此刻应该是 温柔的蓝',
    song.title + ' 唱给每一个不眠的夜',
    '愿你在歌声里 找到安静的答案',
    '（尾奏）',
  ];
  const step = Math.max(8, Math.floor(song.duration / lines.length));
  return lines.map((text, i) => ({ time: i * step, text }));
}
