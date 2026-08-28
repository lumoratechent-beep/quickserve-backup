export const REPORT_PDF_THEME = {
  format: 'a4' as const,
  orientation: 'portrait' as const,
  unit: 'mm' as const,
  margin: 14,
  topAccentHeight: 3,
  font: 'helvetica',
  colors: {
    accent: [217, 119, 6] as [number, number, number],
    heading: [55, 65, 81] as [number, number, number],
    body: [80, 80, 80] as [number, number, number],
    muted: [120, 120, 120] as [number, number, number],
    border: [226, 232, 240] as [number, number, number],
    surface: [250, 251, 252] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  },
  sizes: {
    reportTitle: 19,
    sectionTitle: 11,
    metadata: 9,
    table: 8,
    tableHeader: 7.5,
    footer: 7,
  },
} as const;

export const REPORT_CHART_COLORS: Array<[number, number, number]> = [
  [34, 197, 94],
  [59, 130, 246],
  [239, 68, 68],
  [139, 92, 246],
  [245, 158, 11],
  [6, 182, 212],
  [236, 72, 153],
  [20, 184, 166],
  [99, 102, 241],
  [132, 204, 22],
  [249, 115, 22],
];
