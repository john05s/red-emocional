// front-emocional/src/StatsChart.js
import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as BarTooltip
} from 'recharts';

const COLORS = ['#0088FE','#00C49F','#FFBB28','#FF8042','#A28EF5','#F55A71','#71F5A2','#F5D071'];

export function EmotionPie({ data }) {
  const pieData = Object.entries(data).map(([name, value]) => ({ name, value }));
  return (
    <PieChart width={300} height={300}>
      <Pie
        data={pieData}
        dataKey="value"
        nameKey="name"
        cx="50%" cy="50%"
        outerRadius={100}
        label
      >
        {pieData.map((_, idx) => (
          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
        ))}
      </Pie>
      <PieTooltip />
    </PieChart>
  );
}

export function SessionsBar({ data }) {
  const barData = Object.entries(data).map(([emotion, count]) => ({ emotion, count }));
  return (
    <BarChart
      width={600}
      height={300}
      data={barData}
      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="emotion" />
      <YAxis />
      <BarTooltip />
      <Bar dataKey="count" fill="#007bff" />
    </BarChart>
  );
}
