export interface Palette {
  /** Signature Paprika 3 solid spice-red/orange navigation bar */
  headerBg: string;
  headerText: string;
  /** Standard iOS grouped table background */
  groupedBg: string;
  /** Clean flat paper background for recipe content & rows */
  paperBg: string;
  /** Subtle section band (e.g. Grocery aisle headers & toolbar) */
  bandBg: string;
  /** Inset search field background */
  inputBg: string;
  /** Crisp hairline separator */
  hairline: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Paprika signature accent (#D94325 light / #EF5B3A dark) */
  paprika: string;
  paprikaSoft: string;
  /** Paprika active step highlight */
  activeStepBg: string;
  /** Paprika interactive timer link color */
  timerLink: string;
  star: string;
  success: string;
  danger: string;
}

export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    headerBg: '#D94325',
    headerText: '#FFFFFF',
    groupedBg: '#F2F2F7',
    paperBg: '#FFFFFF',
    bandBg: '#F7F7F9',
    inputBg: '#E9E9EE',
    hairline: '#DEDEE4',
    text: '#1C1C1E',
    textSecondary: '#636366',
    textMuted: '#98989D',
    paprika: '#D94325',
    paprikaSoft: '#FDECE8',
    activeStepBg: '#FFF8E6',
    timerLink: '#0066CC',
    star: '#F5A623',
    success: '#248A3D',
    danger: '#D70015',
  },
  dark: {
    headerBg: '#B8361C',
    headerText: '#FFFFFF',
    groupedBg: '#000000',
    paperBg: '#1C1C1E',
    bandBg: '#252528',
    inputBg: '#2C2C2E',
    hairline: '#343438',
    text: '#F2F2F7',
    textSecondary: '#AEAEB2',
    textMuted: '#636366',
    paprika: '#F26444',
    paprikaSoft: '#3A1F19',
    activeStepBg: '#332B14',
    timerLink: '#4DA3FF',
    star: '#FFD60A',
    success: '#30D158',
    danger: '#FF453A',
  },
};
