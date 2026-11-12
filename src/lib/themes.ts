// Shared by the server, preference editor and validation API.
export const THEMES = [
  { id: 'oled', name: 'OLED Black', description: 'True black surfaces. Luminous accents. Built for the dark.', colors: ['#000000', '#080808', '#a6d8ff'] },
  { id: 'system', name: 'Match device', description: 'Daylight or Midnight, automatically.', colors: ['#f5f7fb', '#172239', '#69b7ff'] },
  { id: 'midnight', name: 'Midnight', description: 'Deep navy. Cool blue. Under the lights.', colors: ['#0b1221', '#192b43', '#79c7ff'] },
  { id: 'light', name: 'Daylight', description: 'Clean white surfaces and crisp ink.', colors: ['#f3f5f8', '#ffffff', '#1254a5'] },
  { id: 'grey', name: 'Graphite', description: 'Neutral grey with a silver finish.', colors: ['#202123', '#303235', '#d6dbdf'] },
  { id: 'field', name: 'Sunday field', description: 'Forest green, warm cream, gold accents.', colors: ['#0d211b', '#1c382c', '#ebce82'] },
  { id: 'game-day', name: 'Game day', description: 'Carbon black with electric coral.', colors: ['#191315', '#352027', '#ff9593'] },
  { id: 'playoffs', name: 'Championship', description: 'Rich plum with a gold spotlight.', colors: ['#20132c', '#372343', '#f2d38a'] },
  { id: 'team', name: 'Home team', description: 'Your team colors, throughout the league.', colors: ['#101e30', '#243b55', '#8ecbff'] },
  { id: 'colorblind', name: 'Clear play', description: 'Blue and amber; results keep their labels.', colors: ['#101f2c', '#1c3546', '#ffd477'] },
  { id: 'high-contrast', name: 'High contrast', description: 'Pure black, white borders, yellow focus.', colors: ['#000000', '#171717', '#ffff00'] },
] as const;

export function teamPalette(hex: string) {
  const parts = hex.replace('#', '').match(/.{2}/g)?.map(v => parseInt(v, 16) / 255);
  if (!parts || parts.length !== 3 || parts.some(v => !Number.isFinite(v))) return {};
  const [r, g, b] = parts, max = Math.max(...parts), min = Math.min(...parts), d = max - min;
  let h = d ? (max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 : 210;
  if (h < 0) h += 360;
  const saturation = d < .05 ? 6 : 65;
  // Deliberately lift dark team colors for readable text and button contrast.
  return { '--primary': `${h} ${saturation}% 78%`, '--ring': `${h} ${saturation}% 78%`,
    '--background': `${h} 24% 9%`, '--card': `${h} 24% 14%`, '--secondary': `${h} 22% 21%`,
    '--accent': `${h} 28% 24%`, '--border': `${h} 18% 34%`, '--input': `${h} 18% 34%`,
    '--popover': `${h} 24% 14%`, '--muted': `${h} 22% 21%` };
}

export function applyTheme(theme: string, color?: string | null) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Remove previous team overrides when switching away, without a reload.
  for (const key of Object.keys(teamPalette('#336699'))) root.style.removeProperty(key);
  if (theme === 'team' && color) for (const [key, value] of Object.entries(teamPalette(color))) root.style.setProperty(key, value);
}
