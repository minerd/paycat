import { useEffect, useState } from 'react';
import { Users, CreditCard, TrendingUp, Apple, Smartphone, DollarSign, FlaskConical } from 'lucide-react';
import { api } from '../lib/api';

interface DashboardData {
  exclude_sandbox?: boolean;
  apps: number;
  total_subscribers: number;
  active_subscriptions: number;
  mrr?: { total: number; currency: string }[];
  revenue_30d: { total: number; currency: string }[];
  events_30d: { event_type: string; count: number }[];
  platform_breakdown: { platform: string; count: number }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [excludeSandbox, setExcludeSandbox] = useState(() => {
    return localStorage.getItem('dashboard_exclude_sandbox') === 'true';
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await api.getDashboard(excludeSandbox);
        setData(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [excludeSandbox]);

  const handleToggleSandbox = () => {
    const newValue = !excludeSandbox;
    setExcludeSandbox(newValue);
    localStorage.setItem('dashboard_exclude_sandbox', String(newValue));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  const totalRevenue = data?.revenue_30d.reduce((sum, r) => sum + (r.total || 0), 0) || 0;
  const totalMrr = data?.mrr?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;

  const stats = [
    {
      name: 'MRR',
      value: `$${(totalMrr / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'bg-emerald-500',
    },
    {
      name: 'Active Subscriptions',
      value: data?.active_subscriptions || 0,
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Subscribers',
      value: data?.total_subscribers || 0,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      name: 'Revenue (30d)',
      value: `$${(totalRevenue / 100).toFixed(2)}`,
      icon: TrendingUp,
      color: 'bg-orange-500',
    },
  ];

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ios':
        return Apple;
      case 'android':
        return Smartphone;
      default:
        return CreditCard;
    }
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'ios':
        return 'iOS';
      case 'android':
        return 'Android';
      case 'stripe':
        return 'Stripe';
      default:
        return platform;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your payment system</p>
        </div>
        <button
          onClick={handleToggleSandbox}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            excludeSandbox
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span className="text-sm font-medium">
            {excludeSandbox ? 'Sandbox Hidden' : 'Sandbox Included'}
          </span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Breakdown</h2>
          {data?.platform_breakdown && data.platform_breakdown.length > 0 ? (
            <div className="space-y-4">
              {data.platform_breakdown.map((item) => {
                const Icon = getPlatformIcon(item.platform);
                const total = data.platform_breakdown.reduce((sum, p) => sum + p.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.platform} className="flex items-center">
                    <div className="flex items-center w-24">
                      <Icon className="w-5 h-5 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-700">
                        {getPlatformLabel(item.platform)}
                      </span>
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {item.count}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No subscription data yet</p>
          )}
        </div>

        {/* Recent Events */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Events (30 days)</h2>
          {data?.events_30d && data.events_30d.length > 0 ? (
            <div className="space-y-3">
              {data.events_30d.slice(0, 8).map((event) => (
                <div key={event.event_type} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{event.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events recorded yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
