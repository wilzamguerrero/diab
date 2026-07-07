// GlucoseChart — SVG line chart of glucose readings over time.
// Animated line draw-in using motion's pathLength.
// Dark navy theme with vibrant colors.

import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { Reading } from '../types';

export interface GlucoseChartProps {
  readings: Reading[];
  targetLow?: number;
  targetHigh?: number;
}

interface ChartPoint {
  x: number;
  y: number;
  glucose: number;
  timestamp: string;
  status: 'low' | 'in-range' | 'high';
}

const PADDING = { top: 30, right: 20, bottom: 40, left: 50 };
const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 240;
const CHART_WIDTH = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom;

function statusColor(status: 'low' | 'in-range' | 'high'): string {
  switch (status) {
    case 'low':
      return '#60a5fa'; // blue
    case 'high':
      return '#f87171'; // red
    case 'in-range':
      return '#4ade80'; // green
  }
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${day}/${month}`;
}

export default function GlucoseChart({
  readings,
  targetLow = 70,
  targetHigh = 180,
}: GlucoseChartProps) {
  const sorted = useMemo(
    () => [...readings].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [readings],
  );

  const { points, yMin, yMax, peakPoint, lowestPoint } = useMemo(() => {
    if (sorted.length === 0) {
      return { points: [] as ChartPoint[], yMin: 40, yMax: 300, peakPoint: null, lowestPoint: null };
    }

    // Determine Y axis bounds (include target range and some buffer)
    const allGlucose = sorted.map((r) => r.glucose);
    const dataMin = Math.min(...allGlucose);
    const dataMax = Math.max(...allGlucose);
    const computedYMin = Math.min(dataMin - 10, targetLow - 10, 40);
    const computedYMax = Math.max(dataMax + 10, targetHigh + 10);

    // Time axis
    const tMin = new Date(sorted[0].timestamp).getTime();
    const tMax = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const tRange = tMax - tMin || 1;

    const pts: ChartPoint[] = sorted.map((r) => {
      const t = new Date(r.timestamp).getTime();
      const x = PADDING.left + ((t - tMin) / tRange) * CHART_WIDTH;
      const y = PADDING.top + (1 - (r.glucose - computedYMin) / (computedYMax - computedYMin)) * CHART_HEIGHT;
      const status: ChartPoint['status'] =
        r.glucose < targetLow ? 'low' : r.glucose > targetHigh ? 'high' : 'in-range';
      return { x, y, glucose: r.glucose, timestamp: r.timestamp, status };
    });

    let peak: ChartPoint | null = pts[0];
    let lowest: ChartPoint | null = pts[0];
    for (const p of pts) {
      if (p.glucose > (peak?.glucose ?? 0)) peak = p;
      if (p.glucose < (lowest?.glucose ?? Infinity)) lowest = p;
    }

    return { points: pts, yMin: computedYMin, yMax: computedYMax, peakPoint: peak, lowestPoint: lowest };
  }, [sorted, targetLow, targetHigh]);

  if (points.length < 2) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '24px' }}>
        Se necesitan al menos 2 lecturas para mostrar la gráfica.
      </p>
    );
  }

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Target range rectangle positions
  const targetHighY = PADDING.top + (1 - (targetHigh - yMin) / (yMax - yMin)) * CHART_HEIGHT;
  const targetLowY = PADDING.top + (1 - (targetLow - yMin) / (yMax - yMin)) * CHART_HEIGHT;

  // Y-axis labels
  const yLabels = [
    { value: yMin, y: PADDING.top + CHART_HEIGHT },
    { value: targetLow, y: targetLowY },
    { value: targetHigh, y: targetHighY },
    { value: yMax, y: PADDING.top },
  ];

  // X-axis date labels (first and last)
  const firstDate = formatDateShort(sorted[0].timestamp);
  const lastDate = formatDateShort(sorted[sorted.length - 1].timestamp);

  return (
    <motion.div
      className="glucose-chart"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Gráfica de glucosa en el tiempo"
      >
        {/* Target range shaded band */}
        <rect
          x={PADDING.left}
          y={targetHighY}
          width={CHART_WIDTH}
          height={targetLowY - targetHighY}
          fill="rgba(74, 222, 128, 0.12)"
          stroke="rgba(74, 222, 128, 0.3)"
          strokeWidth="0.5"
        />

        {/* Y-axis labels */}
        {yLabels.map(({ value, y }) => (
          <text
            key={value}
            x={PADDING.left - 6}
            y={y + 3}
            textAnchor="end"
            fontSize="9"
            fill="rgba(255,255,255,0.6)"
            fontWeight="600"
          >
            {Math.round(value)}
          </text>
        ))}

        {/* X-axis date labels */}
        <text
          x={PADDING.left}
          y={VIEWBOX_HEIGHT - 6}
          textAnchor="start"
          fontSize="9"
          fill="rgba(255,255,255,0.6)"
          fontWeight="600"
        >
          {firstDate}
        </text>
        <text
          x={PADDING.left + CHART_WIDTH}
          y={VIEWBOX_HEIGHT - 6}
          textAnchor="end"
          fontSize="9"
          fill="rgba(255,255,255,0.6)"
          fontWeight="600"
        >
          {lastDate}
        </text>

        {/* Grid lines for target boundaries */}
        <line
          x1={PADDING.left}
          y1={targetHighY}
          x2={PADDING.left + CHART_WIDTH}
          y2={targetHighY}
          stroke="rgba(74, 222, 128, 0.3)"
          strokeDasharray="4 3"
          strokeWidth="0.5"
        />
        <line
          x1={PADDING.left}
          y1={targetLowY}
          x2={PADDING.left + CHART_WIDTH}
          y2={targetLowY}
          stroke="rgba(74, 222, 128, 0.3)"
          strokeDasharray="4 3"
          strokeWidth="0.5"
        />

        {/* Animated line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />

        {/* Data points colored by status */}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={statusColor(p.status)}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="0.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.05, type: 'spring', stiffness: 300, damping: 20 }}
          />
        ))}

        {/* Peak marker annotation */}
        {peakPoint && (
          <g>
            <motion.circle
              cx={peakPoint.x}
              cy={peakPoint.y}
              r="5"
              fill="none"
              stroke="#f87171"
              strokeWidth="1.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.8, type: 'spring', stiffness: 200 }}
            />
            <motion.text
              x={peakPoint.x}
              y={peakPoint.y - 10}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#f87171"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.0 }}
            >
              {peakPoint.glucose}
            </motion.text>
          </g>
        )}

        {/* Lowest point marker */}
        {lowestPoint && lowestPoint !== peakPoint && (
          <g>
            <motion.circle
              cx={lowestPoint.x}
              cy={lowestPoint.y}
              r="5"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="1.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.9, type: 'spring', stiffness: 200 }}
            />
            <motion.text
              x={lowestPoint.x}
              y={lowestPoint.y + 16}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#60a5fa"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.1 }}
            >
              {lowestPoint.glucose}
            </motion.text>
          </g>
        )}
      </svg>
    </motion.div>
  );
}
