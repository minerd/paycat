import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export function MRRLineChart({ data }: { data: { date: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(2)}`, 'MRR']} />
        <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueBarChart({ data }: { data: { date: string; ios?: number; android?: number; stripe?: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip formatter={(v: number | undefined) => `$${(v ?? 0).toFixed(2)}`} />
        <Legend />
        <Bar dataKey="ios" fill="#6366f1" stackId="a" name="iOS" />
        <Bar dataKey="android" fill="#22c55e" stackId="a" name="Android" />
        <Bar dataKey="stripe" fill="#8b5cf6" stackId="a" name="Stripe" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SubscriberAreaChart({ data }: { data: { date: string; new: number; churned: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="new" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="New" />
        <Area type="monotone" dataKey="churned" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Churned" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PlatformPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ChurnLineChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={false} name="Churned" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChurnReasonPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ConversionBarChart({ data }: { data: { name: string; rate: number; color?: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(v: number | undefined) => `${(v ?? 0).toFixed(2)}%`} />
        <Bar dataKey="rate" fill="#6366f1">
          {data.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelChart({ data }: { data: { name: string; value: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-32 text-right">{item.name}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center px-3"
              style={{
                width: `${Math.max((item.value / maxVal) * 100, 5)}%`,
                backgroundColor: COLORS[i % COLORS.length],
              }}
            >
              <span className="text-xs text-white font-medium">{item.value.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CohortTable({ cohorts }: { cohorts: { cohort_month: string; subscribers: number; retention: number[] }[] }) {
  if (cohorts.length === 0) return <p className="text-sm text-gray-500">No cohort data available</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 uppercase">
            <th className="pb-2 pr-4">Cohort</th>
            <th className="pb-2 pr-4">Users</th>
            {cohorts[0]?.retention.map((_, i) => (
              <th key={i} className="pb-2 pr-2 text-center">M{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {cohorts.map((c) => (
            <tr key={c.cohort_month}>
              <td className="py-2 pr-4 font-medium text-gray-700">{c.cohort_month}</td>
              <td className="py-2 pr-4 text-gray-600">{c.subscribers}</td>
              {c.retention.map((r, i) => (
                <td key={i} className="py-2 pr-2 text-center">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `rgba(99, 102, 241, ${Math.max(r / 100, 0.05)})`,
                      color: r > 50 ? 'white' : '#374151',
                    }}
                  >
                    {r}%
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
