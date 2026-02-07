import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Apple,
  Smartphone,
  CreditCard,
  Plus,
  X,
  Key,
  Webhook,
  Tag,
  Users,
  Link2,
  Layout,
  Send,
  Eye,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import Input from '../components/Input';

interface AppData {
  id: string;
  name: string;
  api_key: string;
  created_at: number;
  apple_config: {
    key_id?: string;
    issuer_id?: string;
    bundle_id?: string;
    has_private_key?: boolean;
  } | null;
  google_config: {
    package_name?: string;
    has_service_account?: boolean;
  } | null;
  stripe_config: {
    has_secret_key?: boolean;
    has_webhook_secret?: boolean;
  } | null;
}

interface Entitlement {
  id: string;
  identifier: string;
  display_name: string | null;
}

interface ProductMapping {
  id: string;
  product_id: string;
  platform: string;
  entitlement_id: string;
  entitlement_identifier: string;
}

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  active: number;
  secret?: string;
}

type Tab = 'platforms' | 'entitlements' | 'webhooks' | 'subscribers' | 'integrations' | 'paywalls';

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppData | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subscriberTotal, setSubscriberTotal] = useState(0);
  const [subscriberOffset, setSubscriberOffset] = useState(0);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [paywalls, setPaywalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('platforms');

  // Modal states
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showEntitlementModal, setShowEntitlementModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [showDeliveryLogModal, setShowDeliveryLogModal] = useState<string | null>(null);

  const fetchApp = async () => {
    if (!id) return;
    try {
      const [appResult, entResult, mapResult, webhookResult] = await Promise.all([
        api.getApp(id),
        api.getEntitlements(id),
        api.getProductMappings(id),
        api.getWebhooks(id),
      ]);
      setApp(appResult.app);
      setEntitlements(entResult.entitlements);
      setMappings(mapResult.mappings);
      setWebhooks(webhookResult.webhooks);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApp();
  }, [id]);

  // Lazy load subscribers when tab changes
  useEffect(() => {
    if (activeTab === 'subscribers' && id && subscribers.length === 0) {
      api.getSubscribers(id, 50, 0).then((res) => {
        setSubscribers(res.subscribers);
        setSubscriberTotal(res.total);
      }).catch(() => {});
    }
    if (activeTab === 'integrations' && id && integrations.length === 0) {
      api.getIntegrations(id).then((res) => {
        setIntegrations(res.integrations);
      }).catch(() => {});
    }
    if (activeTab === 'paywalls' && id && paywalls.length === 0) {
      api.getPaywalls(id).then((res) => {
        setPaywalls(res.paywalls);
      }).catch(() => {});
    }
  }, [activeTab, id]);

  const fetchSubscribers = async (offset: number = 0) => {
    if (!id) return;
    const res = await api.getSubscribers(id, 50, offset);
    setSubscribers(res.subscribers);
    setSubscriberTotal(res.total);
    setSubscriberOffset(offset);
  };

  const fetchIntegrations = async () => {
    if (!id) return;
    const res = await api.getIntegrations(id);
    setIntegrations(res.integrations);
  };

  const copyApiKey = async () => {
    if (!app) return;
    await navigator.clipboard.writeText(app.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateKey = async () => {
    if (!id || !confirm('Are you sure? The old API key will stop working immediately.')) return;
    try {
      const result = await api.regenerateApiKey(id);
      setApp((prev) => prev && { ...prev, api_key: result.api_key });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteApp = async () => {
    if (!id) return;
    try {
      await api.deleteApp(id);
      navigate('/apps');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!app) {
    return <div className="text-red-600">App not found</div>;
  }

  const tabs = [
    { id: 'platforms' as Tab, label: 'Platforms', icon: Key },
    { id: 'entitlements' as Tab, label: 'Entitlements', icon: Tag },
    { id: 'webhooks' as Tab, label: 'Webhooks', icon: Webhook },
    { id: 'subscribers' as Tab, label: 'Subscribers', icon: Users },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Link2 },
    { id: 'paywalls' as Tab, label: 'Paywalls', icon: Layout },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/apps')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
            <div className="flex items-center mt-1 space-x-2">
              <code className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {app.api_key}
              </code>
              <button onClick={copyApiKey} className="p-1 text-gray-400 hover:text-gray-600">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={regenerateKey}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Regenerate API Key"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete App
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Platforms Tab */}
      {activeTab === 'platforms' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Apple */}
          <PlatformCard
            title="Apple App Store"
            icon={<Apple className="w-6 h-6" />}
            configured={!!app.apple_config?.has_private_key}
            details={
              app.apple_config
                ? [
                    { label: 'Bundle ID', value: app.apple_config.bundle_id || '-' },
                    { label: 'Key ID', value: app.apple_config.key_id || '-' },
                  ]
                : []
            }
            onConfigure={() => setShowAppleModal(true)}
            onRemove={async () => {
              await api.deleteAppleConfig(id!);
              fetchApp();
            }}
          />

          {/* Google */}
          <PlatformCard
            title="Google Play"
            icon={<Smartphone className="w-6 h-6 text-green-600" />}
            configured={!!app.google_config?.has_service_account}
            details={
              app.google_config
                ? [{ label: 'Package Name', value: app.google_config.package_name || '-' }]
                : []
            }
            onConfigure={() => setShowGoogleModal(true)}
            onRemove={async () => {
              await api.deleteGoogleConfig(id!);
              fetchApp();
            }}
          />

          {/* Stripe */}
          <PlatformCard
            title="Stripe"
            icon={<CreditCard className="w-6 h-6 text-purple-600" />}
            configured={!!app.stripe_config?.has_secret_key}
            details={
              app.stripe_config
                ? [
                    { label: 'Secret Key', value: app.stripe_config.has_secret_key ? 'Configured' : '-' },
                    { label: 'Webhook Secret', value: app.stripe_config.has_webhook_secret ? 'Configured' : '-' },
                  ]
                : []
            }
            onConfigure={() => setShowStripeModal(true)}
            onRemove={async () => {
              await api.deleteStripeConfig(id!);
              fetchApp();
            }}
          />
        </div>
      )}

      {/* Entitlements Tab */}
      {activeTab === 'entitlements' && (
        <div className="space-y-6">
          {/* Entitlement Definitions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Entitlement Definitions</h3>
              <button
                onClick={() => setShowEntitlementModal(true)}
                className="flex items-center text-sm text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Entitlement
              </button>
            </div>
            {entitlements.length === 0 ? (
              <p className="text-sm text-gray-500">No entitlements defined yet</p>
            ) : (
              <div className="space-y-2">
                {entitlements.map((ent) => (
                  <div
                    key={ent.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <code className="text-sm font-medium text-gray-900">{ent.identifier}</code>
                      {ent.display_name && (
                        <span className="ml-2 text-sm text-gray-500">{ent.display_name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Mappings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Product Mappings</h3>
              <button
                onClick={() => setShowMappingModal(true)}
                className="flex items-center text-sm text-indigo-600 hover:text-indigo-700"
                disabled={entitlements.length === 0}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Mapping
              </button>
            </div>
            {mappings.length === 0 ? (
              <p className="text-sm text-gray-500">No product mappings yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="pb-2">Product ID</th>
                      <th className="pb-2">Platform</th>
                      <th className="pb-2">Entitlement</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mappings.map((map) => (
                      <tr key={map.id}>
                        <td className="py-2">
                          <code className="text-sm">{map.product_id}</code>
                        </td>
                        <td className="py-2">
                          <span className="text-sm text-gray-600">{map.platform}</span>
                        </td>
                        <td className="py-2">
                          <code className="text-sm text-indigo-600">{map.entitlement_identifier}</code>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={async () => {
                              await api.deleteProductMapping(map.id);
                              fetchApp();
                            }}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Webhooks</h3>
            <button
              onClick={() => setShowWebhookModal(true)}
              className="flex items-center text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Webhook
            </button>
          </div>
          {webhooks.length === 0 ? (
            <p className="text-sm text-gray-500">No webhooks configured yet</p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <div>
                    <code className="text-sm text-gray-900">{wh.url}</code>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {wh.events.slice(0, 3).map((ev) => (
                        <span key={ev} className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          {ev}
                        </span>
                      ))}
                      {wh.events.length > 3 && (
                        <span className="text-xs text-gray-500">+{wh.events.length - 3} more</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await api.deleteWebhook(wh.id);
                      fetchApp();
                    }}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Subscribers ({subscriberTotal})</h3>
          </div>
          {subscribers.length === 0 ? (
            <p className="text-sm text-gray-500">No subscribers yet</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="pb-2">User ID</th>
                      <th className="pb-2">Active Subs</th>
                      <th className="pb-2">First Seen</th>
                      <th className="pb-2">Last Seen</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subscribers.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/subscribers/${sub.id}`)}>
                        <td className="py-2"><code className="text-sm">{sub.app_user_id}</code></td>
                        <td className="py-2">
                          <span className={`text-sm px-2 py-0.5 rounded ${sub.active_subscriptions > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {sub.active_subscriptions}
                          </span>
                        </td>
                        <td className="py-2 text-sm text-gray-500">{new Date(sub.first_seen_at).toLocaleDateString()}</td>
                        <td className="py-2 text-sm text-gray-500">{new Date(sub.last_seen_at).toLocaleDateString()}</td>
                        <td className="py-2 text-right"><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {subscriberTotal > 50 && (
                <div className="flex justify-between items-center mt-4 pt-4 border-t">
                  <button
                    onClick={() => fetchSubscribers(Math.max(0, subscriberOffset - 50))}
                    disabled={subscriberOffset === 0}
                    className="text-sm text-indigo-600 disabled:text-gray-400"
                  >Previous</button>
                  <span className="text-sm text-gray-500">{subscriberOffset + 1}-{Math.min(subscriberOffset + 50, subscriberTotal)} of {subscriberTotal}</span>
                  <button
                    onClick={() => fetchSubscribers(subscriberOffset + 50)}
                    disabled={subscriberOffset + 50 >= subscriberTotal}
                    className="text-sm text-indigo-600 disabled:text-gray-400"
                  >Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Integrations</h3>
            <button
              onClick={() => setShowIntegrationModal(true)}
              className="flex items-center px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Integration
            </button>
          </div>
          {integrations.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No integrations configured yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {integrations.map((integ) => (
                <div key={integ.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <span className="text-xs font-medium uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded mr-2">{integ.type}</span>
                      <span className="font-medium text-gray-900">{integ.name}</span>
                    </div>
                    <button
                      onClick={async () => {
                        await api.updateIntegration(id!, integ.id, { enabled: !integ.enabled });
                        fetchIntegrations();
                      }}
                      className={`${integ.enabled ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {integ.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(integ.events || []).slice(0, 3).map((ev: string) => (
                      <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{ev}</span>
                    ))}
                    {(integ.events || []).length > 3 && <span className="text-xs text-gray-400">+{integ.events.length - 3}</span>}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={async () => {
                        try {
                          await api.testIntegration(id!, integ.id);
                          alert('Test event sent successfully');
                        } catch (err) {
                          alert('Test failed: ' + (err as Error).message);
                        }
                      }}
                      className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center"
                    >
                      <Send className="w-3 h-3 mr-1" /> Test
                    </button>
                    <button
                      onClick={() => setShowDeliveryLogModal(integ.id)}
                      className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center"
                    >
                      <Eye className="w-3 h-3 mr-1" /> Logs
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Delete this integration?')) {
                          await api.deleteIntegration(id!, integ.id);
                          fetchIntegrations();
                        }
                      }}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Paywalls Tab */}
      {activeTab === 'paywalls' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Paywall Templates</h3>
            <button
              onClick={() => navigate(`/apps/${id}/paywalls/new`)}
              className="flex items-center px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Paywall
            </button>
          </div>
          {paywalls.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <Layout className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No paywall templates yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paywalls.map((pw) => (
                <div key={pw.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-indigo-300 transition-colors cursor-pointer"
                  onClick={() => navigate(`/apps/${id}/paywalls/${pw.identifier}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{pw.name}</span>
                    <div className="flex items-center gap-2">
                      {pw.is_default && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Default</span>}
                      <span className={`text-xs px-2 py-0.5 rounded ${pw.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {pw.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 uppercase">{pw.template_type}</span>
                  {pw.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{pw.description}</p>}
                  <div className="flex items-center mt-3 text-xs text-gray-400">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    {pw.identifier}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAppleModal && (
        <AppleConfigModal
          appId={id!}
          onClose={() => setShowAppleModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showGoogleModal && (
        <GoogleConfigModal
          appId={id!}
          onClose={() => setShowGoogleModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showStripeModal && (
        <StripeConfigModal
          appId={id!}
          onClose={() => setShowStripeModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showEntitlementModal && (
        <EntitlementModal
          appId={id!}
          onClose={() => setShowEntitlementModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showMappingModal && (
        <MappingModal
          appId={id!}
          entitlements={entitlements}
          onClose={() => setShowMappingModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showWebhookModal && (
        <WebhookModal
          appId={id!}
          onClose={() => setShowWebhookModal(false)}
          onSuccess={fetchApp}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          appName={app.name}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteApp}
        />
      )}
      {showIntegrationModal && (
        <IntegrationModal
          appId={id!}
          onClose={() => setShowIntegrationModal(false)}
          onSuccess={fetchIntegrations}
        />
      )}
      {showDeliveryLogModal && (
        <DeliveryLogModal
          appId={id!}
          integrationId={showDeliveryLogModal}
          onClose={() => setShowDeliveryLogModal(null)}
        />
      )}
    </div>
  );
}

// Platform Card Component
function PlatformCard({
  title,
  icon,
  configured,
  details,
  onConfigure,
  onRemove,
}: {
  title: string;
  icon: React.ReactNode;
  configured: boolean;
  details: { label: string; value: string }[];
  onConfigure: () => void;
  onRemove: () => void | Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="p-2 bg-gray-100 rounded-lg mr-3">{icon}</div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        {configured && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            Configured
          </span>
        )}
      </div>
      {configured ? (
        <>
          <div className="space-y-2 mb-4">
            {details.map((d) => (
              <div key={d.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{d.label}</span>
                <span className="text-gray-900 font-medium">{d.value}</span>
              </div>
            ))}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onConfigure}
              className="flex-1 px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
            >
              Update
            </button>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onConfigure}
          className="w-full px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
        >
          Configure
        </button>
      )}
    </div>
  );
}

// Apple Config Modal
function AppleConfigModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [keyId, setKeyId] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveAppleConfig(appId, {
        key_id: keyId,
        issuer_id: issuerId,
        bundle_id: bundleId,
        private_key: privateKey,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Configure Apple App Store" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input label="Key ID" value={keyId} onChange={setKeyId} required placeholder="ABCD1234EF" />
        <Input
          label="Issuer ID"
          value={issuerId}
          onChange={setIssuerId}
          required
          placeholder="12345678-1234-1234-1234-123456789012"
        />
        <Input
          label="Bundle ID"
          value={bundleId}
          onChange={setBundleId}
          required
          placeholder="com.example.app"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Private Key (.p8 content)
          </label>
          <textarea
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            required
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
          />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Google Config Modal
function GoogleConfigModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [packageName, setPackageName] = useState('');
  const [serviceAccount, setServiceAccount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveGoogleConfig(appId, {
        package_name: packageName,
        service_account_json: serviceAccount,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Configure Google Play" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input
          label="Package Name"
          value={packageName}
          onChange={setPackageName}
          required
          placeholder="com.example.app"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service Account JSON
          </label>
          <textarea
            value={serviceAccount}
            onChange={(e) => setServiceAccount(e.target.value)}
            required
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
            placeholder='{"type": "service_account", ...}'
          />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Stripe Config Modal
function StripeConfigModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveStripeConfig(appId, {
        secret_key: secretKey,
        webhook_secret: webhookSecret,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Configure Stripe" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input
          label="Secret Key"
          value={secretKey}
          onChange={setSecretKey}
          required
          placeholder="sk_live_..."
        />
        <Input
          label="Webhook Secret"
          value={webhookSecret}
          onChange={setWebhookSecret}
          required
          placeholder="whsec_..."
        />
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Entitlement Modal
function EntitlementModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createEntitlement(appId, identifier, displayName || undefined);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Entitlement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input
          label="Identifier"
          value={identifier}
          onChange={setIdentifier}
          required
          placeholder="premium"
        />
        <Input
          label="Display Name (optional)"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Premium Access"
        />
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Mapping Modal
function MappingModal({
  appId,
  entitlements,
  onClose,
  onSuccess,
}: {
  appId: string;
  entitlements: Entitlement[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [platform, setPlatform] = useState('ios');
  const [entitlementId, setEntitlementId] = useState(entitlements[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createProductMapping(appId, productId, platform, entitlementId);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Product Mapping" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input
          label="Product ID"
          value={productId}
          onChange={setProductId}
          required
          placeholder="com.example.premium_monthly"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="stripe">Stripe</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entitlement</label>
          <select
            value={entitlementId}
            onChange={(e) => setEntitlementId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            {entitlements.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.identifier}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Webhook Modal
function WebhookModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['initial_purchase', 'renewal', 'cancellation']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newSecret, setNewSecret] = useState('');

  const allEvents = [
    'initial_purchase',
    'renewal',
    'cancellation',
    'expiration',
    'refund',
    'billing_issue',
    'billing_recovery',
    'grace_period_started',
    'trial_started',
    'trial_converted',
    'product_change',
    'reactivation',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api.createWebhook(appId, url, events);
      setNewSecret(result.webhook.secret);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (newSecret) {
    return (
      <Modal title="Webhook Created" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Your webhook has been created. Save this secret - it won't be shown again:
          </p>
          <div className="bg-gray-100 p-3 rounded-lg">
            <code className="text-sm break-all">{newSecret}</code>
          </div>
          <button
            onClick={() => {
              onSuccess();
              onClose();
            }}
            className="w-full px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Webhook" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input
          label="Webhook URL"
          value={url}
          onChange={setUrl}
          required
          placeholder="https://example.com/webhook"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {allEvents.map((ev) => (
              <label key={ev} className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEvents([...events, ev]);
                    } else {
                      setEvents(events.filter((x) => x !== ev));
                    }
                  }}
                  className="mr-2"
                />
                {ev.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || events.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Delete Confirm Modal
function DeleteConfirmModal({
  appName,
  onClose,
  onConfirm,
}: {
  appName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');

  return (
    <Modal title="Delete App" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          This will permanently delete <strong>{appName}</strong> and all its data including
          subscribers, subscriptions, and webhooks.
        </p>
        <p className="text-sm text-gray-600">
          Type <strong>delete</strong> to confirm:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-red-500 focus:border-red-500"
          placeholder="delete"
        />
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmText !== 'delete'}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Delete App
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Integration Modal
function IntegrationModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState('slack');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<string[]>(['*']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const integrationTypes: Record<string, { label: string; fields: { key: string; label: string; placeholder: string }[] }> = {
    slack: { label: 'Slack', fields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/...' }, { key: 'channel', label: 'Channel', placeholder: '#revenue' }] },
    amplitude: { label: 'Amplitude', fields: [{ key: 'api_key', label: 'API Key', placeholder: 'Your Amplitude API key' }] },
    mixpanel: { label: 'Mixpanel', fields: [{ key: 'token', label: 'Token', placeholder: 'Your Mixpanel token' }] },
    segment: { label: 'Segment', fields: [{ key: 'write_key', label: 'Write Key', placeholder: 'Your Segment write key' }] },
    firebase: { label: 'Firebase', fields: [{ key: 'server_key', label: 'Server Key', placeholder: 'Server key' }, { key: 'project_id', label: 'Project ID', placeholder: 'my-project' }] },
    braze: { label: 'Braze', fields: [{ key: 'rest_api_key', label: 'REST API Key', placeholder: 'API key' }, { key: 'instance_url', label: 'Instance URL', placeholder: 'https://rest.iad-01.braze.com' }] },
    webhook: { label: 'Custom Webhook', fields: [{ key: 'url', label: 'URL', placeholder: 'https://api.example.com/webhook' }, { key: 'secret', label: 'Secret (optional)', placeholder: 'Signing secret' }] },
  };

  const allEvents = ['initial_purchase', 'renewal', 'cancellation', 'expiration', 'refund', 'billing_issue', 'trial_started', 'trial_converted', 'product_change'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createIntegration(appId, { type, name: name || integrationTypes[type].label, config, events });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Integration" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setConfig({}); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
            {Object.entries(integrationTypes).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <Input label="Name (optional)" value={name} onChange={setName} placeholder={integrationTypes[type].label} />
        {integrationTypes[type].fields.map((field) => (
          <Input key={field.key} label={field.label} value={config[field.key] || ''} onChange={(v) => setConfig({ ...config, [field.key]: v })} placeholder={field.placeholder} required={!field.label.includes('optional')} />
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
          <label className="flex items-center text-sm mb-2">
            <input type="checkbox" checked={events.includes('*')} onChange={(e) => setEvents(e.target.checked ? ['*'] : [])} className="mr-2" /> All events
          </label>
          {!events.includes('*') && (
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
              {allEvents.map((ev) => (
                <label key={ev} className="flex items-center text-sm">
                  <input type="checkbox" checked={events.includes(ev)} onChange={(e) => {
                    if (e.target.checked) setEvents([...events, ev]);
                    else setEvents(events.filter((x) => x !== ev));
                  }} className="mr-2" />
                  {ev.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Delivery Log Modal
function DeliveryLogModal({
  appId,
  integrationId,
  onClose,
}: {
  appId: string;
  integrationId: string;
  onClose: () => void;
}) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getIntegrationDeliveries(appId, integrationId).then((res) => {
      setDeliveries(res.deliveries);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Modal title="Delivery Log" onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div></div>
      ) : deliveries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No deliveries yet</p>
      ) : (
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="pb-2">Time</th>
                <th className="pb-2">Event</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 text-gray-500">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="py-2"><code className="text-xs">{d.event_type}</code></td>
                  <td className="py-2">{d.response_status || '-'}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${d.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {d.success ? 'Success' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
