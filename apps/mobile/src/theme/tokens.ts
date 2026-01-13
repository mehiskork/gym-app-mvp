export const tokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    title: { fontSize: 22, fontWeight: '700' as const },
    subtitle: { fontSize: 16, fontWeight: '600' as const },
    body: { fontSize: 14, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '400' as const },
  },
  colors: {
    background: '#0B0C10',
    surface: '#11131A',
    text: '#FFFFFF',
    textSecondary: '#B7BAC7',
    primary: '#3B82F6',
    primaryText: '#FFFFFF',
    border: '#23263A',
    danger: '#EF4444',
  },
  touchTargetMin: 44,
} as const;
