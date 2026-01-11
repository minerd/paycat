import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Copy, Check, Apple, Smartphone, CreditCard } from 'lucide-react';
import { api } from '../lib/api';

interface App {
  id: string;
  name: string;
  api_key: string;
  has_apple: number;
  has_google: number;
  has_stripe: number;
  created_at: number;
}

export default function Apps() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchApps = async () => {
    try {
      const result = await api.getApps();
      setApps(result.apps);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;

    setCreating(true);
    try {
      await api.createApp(newAppName);
      setNewAppName('');
      setShowCreate(false);
      fetchApps();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copyApiKey = async (apiKey: string, id: string) => {
    await navigator.clipboard.writeText(apiKey);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apps</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your applications and API keys</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New App
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New App</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label htmlFor="appName" className="block text-sm font-medium text-gray-700 mb-1">
                  App Name
                </label>
                <input
                  id="appName"
                  type="text"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder="My Awesome App"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newAppName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apps List */}
      {apps.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No apps yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first app to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create App
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {apps.map((app) => (
            <Link
              key={app.id}
              to={`/apps/${app.id}`}
              className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{app.name}</h3>
                  <div className="flex items-center mt-2 space-x-2">
                    <code className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {app.api_key.slice(0, 20)}...
                    </code>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        copyApiKey(app.api_key, app.id);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {copiedId === app.id ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {app.has_apple ? (
                    <div className="p-2 bg-gray-100 rounded-lg" title="Apple configured">
                      <Apple className="w-5 h-5 text-gray-700" />
                    </div>
                  ) : null}
                  {app.has_google ? (
                    <div className="p-2 bg-gray-100 rounded-lg" title="Google configured">
                      <Smartphone className="w-5 h-5 text-green-600" />
                    </div>
                  ) : null}
                  {app.has_stripe ? (
                    <div className="p-2 bg-gray-100 rounded-lg" title="Stripe configured">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-400">
                Created {new Date(app.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
