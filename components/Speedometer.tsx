import React from 'react';
import { motion } from 'motion/react';
import { Unit } from '../types';

interface SpeedometerProps {
  currentSpeed: number; // in current unit
  limit: number;
  unit: Unit;
  maxSpeed: number;
}

const Speedometer: React.FC<SpeedometerProps> = ({ currentSpeed, limit, unit, maxSpeed }) => {
  // Config
  const radius = 120;
  const stroke = 15;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  // Calculate percentage of max speed (cap at logic max for visualization)
  const visualMax = Math.max(limit * 1.5, 100); 
  const progress = Math.min(currentSpeed / visualMax, 1);
  
  // Color logic
  let color = '#3b82f6'; // blue-500 default
  let glowColor = 'rgba(59, 130, 246, 0.5)';
  
  if (currentSpeed > limit) {
    color = '#ef4444'; // red-500
    glowColor = 'rgba(239, 68, 68, 0.5)';
  } else if (currentSpeed > limit * 0.9) {
    color = '#f97316'; // orange-500
    glowColor = 'rgba(249, 115, 22, 0.5)';
  } else if (currentSpeed > 0) {
    color = '#10b981'; // green-500
    glowColor = 'rgba(16, 185, 129, 0.5)';
  }

  // Rotation for gauge effect (start at -90deg)
  const startAngle = -210;
  const endAngle = 30;
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (progress * totalAngle);

  // Helper for polar coords
  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  };

  const trackPath = describeArc(150, 150, 110, startAngle, endAngle);
  const valuePath = describeArc(150, 150, 110, startAngle, currentAngle);

  // Indicator tick for speed limit
  const limitProgress = Math.min(limit / visualMax, 1);
  const limitAngle = startAngle + (limitProgress * totalAngle);

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[340px] aspect-square">
      {/* Background Glow */}
      <div 
        className="absolute inset-0 rounded-full blur-[80px] opacity-20 transition-colors duration-500"
        style={{ backgroundColor: color }}
      />

      {/* Top Info (Limit) */}
      <div className="absolute top-6 flex flex-col items-center z-20">
        <div className="flex items-center space-x-2 bg-zinc-900/80 px-4 py-1.5 rounded-full border border-zinc-800 backdrop-blur-md shadow-lg">
          <span className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">Speed Limit</span>
          <div className="w-1 h-1 rounded-full bg-zinc-700" />
          <span className="text-sm font-speedo font-bold text-zinc-100">{limit}</span>
          <span className="text-[9px] text-zinc-500 font-bold uppercase">{unit}</span>
        </div>
      </div>

      <svg
        viewBox="0 0 300 280"
        className="w-full h-full relative z-10"
      >
        <defs>
          <linearGradient id="speedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
          </linearGradient>
          <filter id="speedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Ring */}
        <circle 
          cx="150" cy="150" r="135" 
          fill="none" 
          stroke="#18181b" 
          strokeWidth="1" 
          strokeDasharray="4 4"
        />

        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="#18181b"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Value Path */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ d: valuePath }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
          fill="none"
          stroke="url(#speedGrad)"
          strokeWidth="16"
          strokeLinecap="round"
          filter="url(#speedGlow)"
        />

        {/* Ticks */}
        {[...Array(11)].map((_, i) => {
          const angle = startAngle + (i / 10) * totalAngle;
          const p1 = polarToCartesian(150, 150, 120, angle);
          const p2 = polarToCartesian(150, 150, 130, angle);
          return (
            <line 
              key={i}
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={currentAngle >= angle ? color : "#27272a"}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
          );
        })}

        {/* Limit Marker */}
        {limit > 0 && (
          <motion.g animate={{ rotate: 0 }}>
            <line 
              x1={polarToCartesian(150, 150, 135, limitAngle).x} 
              y1={polarToCartesian(150, 150, 135, limitAngle).y} 
              x2={polarToCartesian(150, 150, 95, limitAngle).x} 
              y2={polarToCartesian(150, 150, 95, limitAngle).y}
              stroke="#ef4444"
              strokeWidth="4"
              strokeDasharray="2 2"
              className="drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]"
            />
            <circle 
              cx={polarToCartesian(150, 150, 135, limitAngle).x}
              cy={polarToCartesian(150, 150, 135, limitAngle).y}
              r="4"
              fill="#ef4444"
            />
          </motion.g>
        )}
      </svg>

      {/* Digital Readout */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/3 text-center z-20">
        <motion.div 
          key={currentSpeed.toFixed(0)}
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-speedo text-8xl font-black tracking-tighter italic" 
          style={{ 
            color,
            textShadow: `0 0 30px ${glowColor}`
          }}
        >
          {currentSpeed.toFixed(0)}
        </motion.div>
        <div className="text-zinc-500 text-sm font-speedo font-bold uppercase tracking-[0.4em] mt-2">
          {unit}
        </div>
      </div>
    </div>
  );
};

export default Speedometer;
