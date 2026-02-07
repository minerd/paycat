import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Clock, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import Input from '../components/Input';

type SubTab = 'overview' | 'subscriptions' | 'transactions' | 'timeline';

export default function SubscriberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subscriber, setSubscriber] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [entitlements, setEntitlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subTab, setSubTab] = useState<SubTab>('overview');

  // Modals
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null);
  const [showRefundModal, setShowRefundModal] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    try {
      const [subResult, timelineResult] = await Promise.all([
        api.getSubscriber(id),
        api.getSubscriberTimeline(id),
      ]);
      setSubscriber(subResult.subscriber);
      setSubscriptions(subResult.subscriptions);
      setTransactions(subResult.transactions);
      setTimeline(timelineResult.timeline);

      // Get entitlements for the app
      if (subResult.subscriber?.app_id) {
        const entResult = await api.getEntitlements(subResult.subscriber.app_id);
        setEntitlements(entResult.entitlements);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!subscriber) {
    return <div className="text-red-600">{error || 'Subscriber not found'}</div>;
  }

  const totalRevenue = transactions.reduce((sum, t) => sum + (t.revenue_amount || 0), 0) / 100;
  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'subscriptions', label: `Subscriptions (${subscriptions.length})` },
    { id: 'transactions', label: `Transactions (${transactions.length})` },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{subscriber.app_user_id}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>First seen: {new Date(subscriber.first_seen_at).toLocaleDateString()}</span>
              <span>Last seen: {new Date(subscriber.last_seen_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowGrantModal(true)}
            className="flex items-center px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Gift className="w-4 h-4 mr-1" /> Grant Entitlement
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`py-3 px-1 border-b-2 text-sm font-medium ${
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

      {/* Overview Tab */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
              <p className="text-3xl font-bold text-indigo-600">${totalRevenue.toFixed(2)}</p>
              <p className="text-sm text-gray-500 mt-1">Total Revenue</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
              <p className="text-3xl font-bold text-green-600">{activeSubscriptions.length}</p>
              <p className="text-sm text-gray-500 mt-1">Active Subscriptions</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
              <p className="text-3xl font-bold text-gray-900">{transactions.length}</p>
              <p className="text-sm text-gray-500 mt-1">Total Transactions</p>
            </div>
          </div>

          {/* Attributes */}
          {subscriber.attributes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Custom Attributes</h3>
              <div className="space-y-1">
                {Object.entries(JSON.parse(subscriber.attributes)).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-900">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Subscriptions Quick View */}
          {activeSubscriptions.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Active Subscriptions</h3>
              <div className="space-y-2">
                {activeSubscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <code className="text-sm font-medium">{s.product_id}</code>
                      <span className="ml-2 text-xs text-gray-500">{s.platform}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {s.expires_at ? `Expires: ${new Date(s.expires_at).toLocaleDateString()}` : 'No expiry'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subscriptions Tab */}
      {subTab === 'subscriptions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-500">No subscriptions</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="pb-2">Product</th>
                  <th className="pb-2">Platform</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Expires</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3"><code className="text-sm">{s.product_id}</code></td>
                    <td className="py-3 text-gray-500">{s.platform}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        s.status === 'active' ? 'bg-green-100 text-green-700' :
                        s.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{s.status}</span>
                      {s.is_trial ? <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Trial</span> : null}
                    </td>
                    <td className="py-3 text-gray-500">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '-'}</td>
                    <td className="py-3 text-gray-500">{s.price_amount ? `$${(s.price_amount / 100).toFixed(2)}` : '-'}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setShowExtendModal(s.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50"
                      >
                        <Clock className="w-3 h-3 inline mr-1" />Extend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {subTab === 'transactions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500">No transactions</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="pb-2">Transaction ID</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3"><code className="text-xs">{t.transaction_id}</code></td>
                    <td className="py-3 text-gray-500 capitalize">{t.type}</td>
                    <td className="py-3">{t.revenue_amount ? `$${(t.revenue_amount / 100).toFixed(2)} ${t.revenue_currency || ''}` : '-'}</td>
                    <td className="py-3 text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      {t.is_refunded ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Refunded</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Paid</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {!t.is_refunded && t.revenue_amount && (
                        <button
                          onClick={() => setShowRefundModal(t.id)}
                          className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                        >
                          <RefreshCw className="w-3 h-3 inline mr-1" />Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Timeline Tab */}
      {subTab === 'timeline' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-500">No events</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              <div className="space-y-4">
                {timeline.map((event, i) => (
                  <div key={`${event.source}-${event.id || i}`} className="relative pl-10">
                    <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-white ${
                      event.source === 'transaction' ? 'bg-green-500' :
                      event.source === 'entitlement' ? 'bg-purple-500' :
                      event.type === 'cancellation' || event.type === 'expiration' ? 'bg-red-500' :
                      'bg-indigo-500'
                    }`}></div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {(event.type || '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        {event.product_id && <span>Product: {event.product_id}</span>}
                        {event.platform && <span>Platform: {event.platform}</span>}
                        {event.revenue_amount && <span>Revenue: ${(event.revenue_amount / 100).toFixed(2)}</span>}
                        {event.entitlement && <span>Entitlement: {event.entitlement}</span>}
                        {event.reason && <span>Reason: {event.reason}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grant Entitlement Modal */}
      {showGrantModal && (
        <GrantEntitlementModal
          subscriberId={id!}
          entitlements={entitlements}
          onClose={() => setShowGrantModal(false)}
          onSuccess={fetchData}
        />
      )}

      {/* Extend Subscription Modal */}
      {showExtendModal && (
        <ExtendSubscriptionModal
          subscriberId={id!}
          subscriptionId={showExtendModal}
          onClose={() => setShowExtendModal(null)}
          onSuccess={fetchData}
        />
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <RefundModal
          subscriberId={id!}
          transactionId={showRefundModal}
          onClose={() => setShowRefundModal(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function GrantEntitlementModal({ subscriberId, entitlements, onClose, onSuccess }: {
  subscriberId: string;
  entitlements: { id: string; identifier: string; display_name: string | null }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [entitlementId, setEntitlementId] = useState(entitlements[0]?.id || '');
  const [reason, setReason] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const expiresAt = expiresInDays ? Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000 : undefined;
      await api.grantEntitlement(subscriberId, entitlementId, reason || undefined, expiresAt);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Grant Entitlement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entitlement</label>
          <select value={entitlementId} onChange={(e) => setEntitlementId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            {entitlements.map((e) => <option key={e.id} value={e.id}>{e.identifier}{e.display_name ? ` (${e.display_name})` : ''}</option>)}
          </select>
        </div>
        <Input label="Reason (optional)" value={reason} onChange={setReason} placeholder="Promotional access" />
        <Input label="Expires in (days, leave empty for permanent)" value={expiresInDays} onChange={setExpiresInDays} placeholder="30" type="number" />
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !entitlementId} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Granting...' : 'Grant'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExtendSubscriptionModal({ subscriberId, subscriptionId, onClose, onSuccess }: {
  subscriberId: string;
  subscriptionId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [days, setDays] = useState('7');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.extendSubscription(subscriberId, subscriptionId, parseInt(days));
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Extend Subscription" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input label="Days to extend" value={days} onChange={setDays} required type="number" placeholder="7" />
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Extending...' : 'Extend'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RefundModal({ subscriberId, transactionId, onClose, onSuccess }: {
  subscriberId: string;
  transactionId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleRefund = async () => {
    setSaving(true);
    setError('');
    try {
      await api.refundTransaction(subscriberId, transactionId);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Issue Refund" onClose={onClose}>
      <div className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <p className="text-sm text-gray-600">
          Are you sure you want to mark this transaction as refunded? This action will flag the transaction in analytics.
        </p>
        <div className="flex justify-end space-x-3 pt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleRefund} disabled={saving} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Processing...' : 'Confirm Refund'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
