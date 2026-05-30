// Minimal dependency-free MMR sparkline. Stretches to the container width;
// colored green/red/purple by the net change across the series.
export default function Sparkline({ values = [], height = 40 }) {
  if (!Array.isArray(values) || values.length < 2) return null

  const width = 240
  const pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = (width - pad * 2) / (values.length - 1)

  const points = values.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const net = values[values.length - 1] - values[0]
  const color = net > 0 ? '#22c55e' : net < 0 ? '#ef4444' : '#aa3bff'
  const [lastX, lastY] = points[points.length - 1].split(',')

  return (
    <svg
      className="mmr-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label="MMR over the session"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}
