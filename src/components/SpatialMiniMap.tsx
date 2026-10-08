import React from 'react';
import { CSGBoxConfig, PlayerTelemetry } from '../types/controller';

interface SpatialMiniMapProps {
  telemetry: PlayerTelemetry;
  boxes: CSGBoxConfig[];
}

const COLOR_MAP: Record<string, string> = {
  Orange: '#d97a2e',
  Red: '#b23636',
  Green: '#3f7a3f',
  Dark: '#475569',
};

export const SpatialMiniMap: React.FC<SpatialMiniMapProps> = ({ telemetry, boxes }) => {
  const [px, , pz] = telemetry.position;
  // PRD v2.0 Section 4.5.5 specification:
  // SVG 180x180, center (90, 90), radarScale = 4.5 px/m, radarRange = 25 m
  const radarScale = 4.5;
  const center = 90;
  const radarRange = 25;

  const camYaw = telemetry.playerRotationY;
  const visualsWorldYaw = telemetry.playerRotationY + telemetry.visualsRotationY;

  // Dynamic FOV viewing wedge path
  const fovRad = ((telemetry.currentFov || 70) * Math.PI) / 180;
  const wedgeRadius = 78;
  const halfFov = fovRad * 0.5;
  const wx1 = center - Math.sin(halfFov) * wedgeRadius;
  const wy1 = center - Math.cos(halfFov) * wedgeRadius;
  const wx2 = center + Math.sin(halfFov) * wedgeRadius;
  const wy2 = center - Math.cos(halfFov) * wedgeRadius;
  const fovWedgePath = `M ${center} ${center} L ${wx1.toFixed(1)} ${wy1.toFixed(1)} A ${wedgeRadius} ${wedgeRadius} 0 0 1 ${wx2.toFixed(1)} ${wy2.toFixed(1)} Z`;

  return (
    <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-white/15 shadow-xl overflow-hidden flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 180 180"
        className="w-full h-full"
        aria-label="Top-down 180x180 spatial radar of OBB obstacles and player vectors"
      >
        {/* 3 Concentric Grid Circles (30, 60, 85 px) */}
        <circle
          cx={center}
          cy={center}
          r={30}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
        <circle
          cx={center}
          cy={center}
          r={60}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
        <circle
          cx={center}
          cy={center}
          r={85}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* Crosshair (2 lines) */}
        <line
          x1={center}
          y1={0}
          x2={center}
          y2={180}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
        <line
          x1={0}
          y1={center}
          x2={180}
          y2={center}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />

        {/* Viewing Cone Wedge (FOV degrees) */}
        <path d={fovWedgePath} fill="rgba(56, 189, 248, 0.14)" />

        {/* OBB Boxes transformed relative to camera azimuth */}
        <g>
          {boxes.map((b) => {
            const dx = b.position[0] - px;
            const dz = b.position[2] - pz;
            if (Math.hypot(dx, dz) > radarRange + Math.max(b.size[0], b.size[2])) {
              return null;
            }

            // Rotate relative to camera yaw so camera forward (-Z) maps upward on SVG
            const cosA = Math.cos(camYaw);
            const sinA = Math.sin(camYaw);
            const rx = dx * cosA - dz * sinA;
            const rz = dx * sinA + dz * cosA;

            const sx = center + rx * radarScale;
            const sy = center + rz * radarScale;
            const w = b.size[0] * radarScale;
            const d = b.size[2] * radarScale;
            const rotDeg = ((camYaw - b.rotationY) * 180) / Math.PI;

            return (
              <g
                key={b.id}
                transform={`translate(${sx.toFixed(2)}, ${sy.toFixed(2)}) rotate(${rotDeg.toFixed(1)})`}
              >
                <rect
                  x={-w / 2}
                  y={-d / 2}
                  width={w}
                  height={d}
                  rx={2}
                  fill={COLOR_MAP[b.color] || '#d97a2e'}
                  fillOpacity={0.82}
                  stroke="#ffffff"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </g>

        {/* Orange Player Direction Arrow (visualsRotationY relative to camera yaw) */}
        <g
          transform={`translate(${center}, ${center}) rotate(${
            (-telemetry.visualsRotationY * 180) / Math.PI
          })`}
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-24}
            stroke="#fb923c"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <polygon points="0,-29 -5.5,-19 5.5,-19" fill="#fb923c" />
        </g>

        {/* Blue Player Dot (r=3.5) */}
        <circle
          cx={center}
          cy={center}
          r={4}
          fill="#38bdf8"
          stroke="#090d16"
          strokeWidth="1.5"
        />
      </svg>

      <span className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-400">
        {((visualsWorldYaw * 180) / Math.PI).toFixed(0)}°
      </span>
    </div>
  );
};
