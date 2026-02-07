import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  RevenueBarChart, SubscriberAreaChart,
  PlatformPieChart, ChurnLineChart, ChurnReasonPieChart,
  FunnelChart, CohortTable,
} from '../components/charts';
import { TrendingUp, Users, CreditCard, AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';

type SubTab = 'overview' | 'revenue' | 'subscribers' | 'churn' | 'cohorts';

export default function Analytics() {
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [period, setPeriod] = useState('30d');
  const [excludeSandbox, setExcludeSandbox] = useState(() => localStorage.getItem('analytics_sandbox') === 'true');
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data
  const [overview, setOverview] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [subscribers, setSubscribers] = useState<any>(null);
  const [churn, setChurn] = useState<any>(null);
  const [cohort, setCohort] = useState<any>(null);
  const [ltv, setLtv] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);

  useEffect(() => {
    api.getApps().then((res) => {
      setApps(res.apps);
      if (res.apps.length > 0) setSelectedApp(res.apps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedApp) return;
    setLoading(true);
    loadData();
  }, [selectedApp, period, excludeSandbox]);

  const loadData = async () => {
    if (!selectedApp) return;
    setError('');
    try {
      const [ov, rev, sub, ch, co, lt, fn] = await Promise.all([
        api.getAnalyticsOverview(selectedApp, period, excludeSandbox),
        api.getAnalyticsRevenue(selectedApp, period, excludeSandbox),
        api.getAnalyticsSubscribers(selectedApp, excludeSandbox),
        api.getAnalyticsChurn(selectedApp, period, excludeSandbox),
        api.getAnalyticsCohort(selectedApp),
        api.getAnalyticsLTV(selectedApp),
        api.getAnalyticsFunnel(selectedApp, period),
      ]);
      setOverview(ov);
      setRevenue(rev);
      setSubscribers(sub);
      setChurn(ch);
      setCohort(co);
      setLtv(lt);
      setFunnel(fn);
    } catch (err) {
      setError((err as Error).message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleSandboxToggle = () => {
    const next = !excludeSandbox;
    setExcludeSandbox(next);
    localStorage.setItem('analytics_sandbox', String(next));
  };

  const periods = [
    { label: '7d', value: '7d' },
    { label: '14d', value: '14d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
  ];

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'subscribers', label: 'Subscribers' },
    { id: 'churn', label: 'Churn' },
    { id: 'cohorts', label: 'Cohorts' },
  ];

  // Transform revenue data for stacked bar chart
  const revenueBarData = (() => {
    if (!revenue?.data) return [];
    const grouped: Record<string, { date: string; ios: number; android: number; stripe: number }> = {};
    for (const r of revenue.data) {
      if (!grouped[r.date]) grouped[r.date] = { date: r.date, ios: 0, android: 0, stripe: 0 };
      const p = r.platform as 'ios' | 'android' | 'stripe';
      if (p in grouped[r.date]) grouped[r.date][p] += r.revenue;
    }
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // Transform subscriber growth data
  const growthData = (() => {
    if (!subscribers?.growth) return [];
    const grouped: Record<string, { date: string; new: number; churned: number }> = {};
    for (const g of subscribers.growth) {
      if (!grouped[g.date]) grouped[g.date] = { date: g.date, new: 0, churned: 0 };
      if (['initial_purchase', 'trial_started'].includes(g.event_type)) grouped[g.date].new += g.count;
      else grouped[g.date].churned += g.count;
    }
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex items-center space-x-3">
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1 text-sm rounded-md ${period === p.value ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSandboxToggle}
            className={`px-3 py-1.5 text-xs rounded-lg border ${excludeSandbox ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-600'}`}
          >
            {excludeSandbox ? 'Production Only' : 'Including Sandbox'}
          </button>
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Sub-tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                subTab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      ) : !selectedApp ? (
        <div className="text-center py-16 text-gray-500">Select an app to view analytics</div>
      ) : (
        <>
          {/* Overview Tab */}
          {subTab === 'overview' && overview && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KPICard label="MRR" value={`$${((overview.mrr || 0) / 100).toFixed(0)}`} icon={<CreditCard className="w-5 h-5" />} color="indigo" />
                <KPICard label="Active Subs" value={overview.active_subscribers} icon={<Users className="w-5 h-5" />} color="green" />
                <KPICard label="Active Trials" value={overview.active_trials} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
                <KPICard label="Churn Rate" value={`${overview.churn_rate}%`} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
                <KPICard label="New Subs" value={overview.new_subscribers} icon={<ArrowUpRight className="w-5 h-5" />} color="emerald" />
                <KPICard label="Conversions" value={overview.conversions} icon={<ArrowDownRight className="w-5 h-5" />} color="purple" />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Revenue ({period})</h3>
                  <RevenueBarChart data={revenueBarData} />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Subscriber Growth</h3>
                  <SubscriberAreaChart data={growthData} />
                </div>
              </div>

              {/* Funnel */}
              {funnel && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Subscription Funnel</h3>
                  <FunnelChart data={[
                    { name: 'Trials Started', value: funnel.trials_started },
                    { name: 'Trials Converted', value: funnel.trials_converted },
                    { name: 'Active Subs', value: funnel.subscriptions_active },
                  ]} />
                  <div className="flex gap-8 mt-4 text-sm text-gray-500">
                    <span>Conversion Rate: <strong className="text-gray-900">{funnel.conversion_rate}%</strong></span>
                    <span>Churn Rate: <strong className="text-gray-900">{funnel.churn_rate}%</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Tab */}
          {subTab === 'revenue' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Revenue by Platform</h3>
                  <RevenueBarChart data={revenueBarData} />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Revenue Share</h3>
                  {overview?.revenue_by_platform && (
                    <PlatformPieChart data={
                      Object.entries(overview.revenue_by_platform as Record<string, number>)
                        .filter(([_, v]) => v > 0)
                        .map(([k, v]) => ({ name: k.toUpperCase(), value: v / 100 }))
                    } />
                  )}
                </div>
              </div>

              {/* LTV Section */}
              {ltv && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Lifetime Value (LTV)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">${ltv.average_ltv?.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Average LTV</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">${ltv.median_ltv?.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Median LTV</p>
                    </div>
                    {ltv.by_platform && Object.entries(ltv.by_platform as Record<string, number>).map(([p, v]) => (
                      <div key={p} className="text-center">
                        <p className="text-2xl font-bold text-gray-900">${(v as number).toFixed(2)}</p>
                        <p className="text-sm text-gray-500">{p.toUpperCase()} LTV</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subscribers Tab */}
          {subTab === 'subscribers' && subscribers && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Subscriber Growth</h3>
                  <SubscriberAreaChart data={growthData} />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">By Platform</h3>
                  <PlatformPieChart data={
                    Object.entries(subscribers.by_platform as Record<string, number>)
                      .filter(([_, v]) => v > 0)
                      .map(([k, v]) => ({ name: k.toUpperCase(), value: v }))
                  } />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">By Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(subscribers.by_status as Record<string, number>).map(([status, count]) => (
                    <div key={status} className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                      <p className="text-sm text-gray-500 capitalize">{status.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Churn Tab */}
          {subTab === 'churn' && churn && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                  <p className="text-3xl font-bold text-red-600">{churn.churn_rate}%</p>
                  <p className="text-sm text-gray-500">Churn Rate</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                  <p className="text-3xl font-bold text-gray-900">{churn.total_churned}</p>
                  <p className="text-sm text-gray-500">Total Churned</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                  <p className="text-3xl font-bold text-green-600">{churn.active_subscribers}</p>
                  <p className="text-sm text-gray-500">Active Subscribers</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Churn Over Time</h3>
                  <ChurnLineChart data={churn.over_time || []} />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Churn by Reason</h3>
                  <ChurnReasonPieChart data={
                    Object.entries(churn.by_reason as Record<string, number>)
                      .map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v }))
                  } />
                </div>
              </div>
            </div>
          )}

          {/* Cohorts Tab */}
          {subTab === 'cohorts' && cohort && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Cohort Retention</h3>
              <CohortTable cohorts={cohort.cohorts || []} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPICard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const bgMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
        <div className={`p-1.5 rounded-lg ${bgMap[color] || 'bg-gray-50 text-gray-600'}`}>{icon}</div>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
