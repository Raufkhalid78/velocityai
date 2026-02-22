import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2 } from 'lucide-react';
import { SpeedData, Unit } from '../types';

interface HistoryChartProps {
  data: SpeedData[];
  unit: Unit;
  limit: number;
}

const HistoryChart: React.FC<HistoryChartProps> = ({ data, unit, limit }) => {
  // Downsample data for performance if needed, taking last 50 points
  const chartData = data.slice(-50).map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    speed: parseFloat(d.speed.toFixed(1)),
    limit: limit
  }));

  if (data.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-3">
        <BarChart2 size={32} className="opacity-20" />
        <p className="text-xs font-medium tracking-widest uppercase opacity-40">Awaiting telemetry data...</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
          <XAxis 
            dataKey="time" 
            hide 
          />
          <YAxis 
            domain={[0, 'auto']} 
            tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(9, 9, 11, 0.9)', 
              borderColor: 'rgba(39, 39, 42, 0.5)', 
              borderRadius: '12px',
              backdropFilter: 'blur(8px)',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono'
            }}
            itemStyle={{ color: '#3b82f6' }}
            cursor={{ stroke: '#27272a', strokeWidth: 2 }}
          />
          <Area 
            type="monotone" 
            dataKey="speed" 
            stroke="#3b82f6" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorSpeed)" 
            isAnimationActive={true}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HistoryChart;