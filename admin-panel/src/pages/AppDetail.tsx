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
} from 'lucide-react';
import { api } from '../lib/api';

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

type Tab = 'platforms' | 'entitlements' | 'webhooks';

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppData | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
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
  onRemove: () => void;
}) {
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
              onClick={onRemove}
              className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Remove
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

// Reusable Modal Component
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Reusable Input Component
function Input({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  );
}
