import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { ConversionBarChart } from '../components/charts';
import { Plus, Play, Pause, Square, Trash2, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

type StatusFilter = 'all' | 'draft' | 'running' | 'completed' | 'paused';

export default function Experiments() {
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  useEffect(() => {
    api.getApps().then((res) => {
      setApps(res.apps);
      if (res.apps.length > 0) setSelectedApp(res.apps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedApp) return;
    fetchExperiments();
  }, [selectedApp, statusFilter]);

  const fetchExperiments = async () => {
    if (!selectedApp) return;
    setLoading(true);
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const res = await api.getExperiments(selectedApp, status);
      setExperiments(res.experiments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (expId: string) => {
    if (expandedId === expId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(expId);
    if (!results[expId]) {
      try {
        const res = await api.getExperimentResults(expId);
        setResults((prev) => ({ ...prev, [expId]: res }));
      } catch {}
    }
  };

  const updateStatus = async (expId: string, status: string) => {
    try {
      await api.updateExperiment(expId, { status });
      fetchExperiments();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const deleteExperiment = async (expId: string) => {
    if (!confirm('Delete this experiment and all its data?')) return;
    try {
      await api.deleteExperiment(expId);
      fetchExperiments();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    running: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
  };

  const filters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'draft', label: 'Draft' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Experiments</h1>
        <div className="flex items-center space-x-3">
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={!selectedApp}
            className="flex items-center px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-1" /> New Experiment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-4 py-1.5 text-sm rounded-md ${statusFilter === f.id ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      ) : experiments.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No experiments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <div key={exp.id} className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Experiment Header */}
              <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(exp.id)}>
                <div className="flex items-center space-x-3">
                  <FlaskConical className="w-5 h-5 text-indigo-500" />
                  <div>
                    <h3 className="font-medium text-gray-900">{exp.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className={`px-2 py-0.5 rounded ${statusColors[exp.status] || 'bg-gray-100'}`}>
                        {exp.status}
                      </span>
                      <span>{(exp.variants || []).length} variants</span>
                      <span>{exp.enrollment_count} enrollments</span>
                      {exp.start_at && <span>Started: {new Date(exp.start_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {exp.status === 'draft' && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(exp.id, 'running'); }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Start">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {exp.status === 'running' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(exp.id, 'paused'); }}
                        className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Pause">
                        <Pause className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(exp.id, 'completed'); }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Complete">
                        <Square className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {exp.status === 'paused' && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(exp.id, 'running'); }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Resume">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); deleteExperiment(exp.id); }}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedId === exp.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === exp.id && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                  {exp.description && <p className="text-sm text-gray-600">{exp.description}</p>}

                  {/* Variants Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                          <th className="pb-2">Variant</th>
                          <th className="pb-2">Weight</th>
                          <th className="pb-2">Enrollments</th>
                          <th className="pb-2">Conversions</th>
                          <th className="pb-2">Conv. Rate</th>
                          <th className="pb-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(results[exp.id]?.variants || exp.variants || []).map((v: any) => (
                          <tr key={v.variant_id || v.id}>
                            <td className="py-2 font-medium">{v.name}</td>
                            <td className="py-2 text-gray-500">{v.weight}%</td>
                            <td className="py-2">{v.enrollments ?? '-'}</td>
                            <td className="py-2">{v.conversions ?? '-'}</td>
                            <td className="py-2">{v.conversion_rate !== undefined ? `${v.conversion_rate}%` : '-'}</td>
                            <td className="py-2">{v.revenue !== undefined ? `$${v.revenue.toFixed(2)}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Significance */}
                  {results[exp.id]?.significance && (
                    <div className={`p-3 rounded-lg text-sm ${
                      results[exp.id].significance.significant
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : results[exp.id].significance.p_value <= 0.10
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}>
                      <strong>Statistical Significance:</strong>{' '}
                      Z-score: {results[exp.id].significance.z_score},{' '}
                      p-value: {results[exp.id].significance.p_value < 0.001 ? '<0.001' : results[exp.id].significance.p_value},{' '}
                      {results[exp.id].significance.significant ? 'Statistically significant (p < 0.05)' : 'Not yet significant'}
                    </div>
                  )}

                  {/* Conversion Rate Chart */}
                  {results[exp.id]?.variants?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Conversion Rate Comparison</h4>
                      <ConversionBarChart data={
                        results[exp.id].variants.map((v: any) => ({
                          name: v.name,
                          rate: v.conversion_rate || 0,
                        }))
                      } />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && selectedApp && (
        <CreateExperimentModal
          appId={selectedApp}
          onClose={() => setShowCreateModal(false)}
          onSuccess={fetchExperiments}
        />
      )}
    </div>
  );
}

function CreateExperimentModal({ appId, onClose, onSuccess }: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState([
    { name: 'Control', offering_id: '', weight: 50 },
    { name: 'Variant A', offering_id: '', weight: 50 },
  ]);
  const [offerings, setOfferings] = useState<{ id: string; identifier: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOfferings(appId).then((res) => setOfferings(res.offerings || [])).catch(() => {});
  }, [appId]);

  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);

  const addVariant = () => {
    const remaining = 100 - totalWeight;
    setVariants([...variants, { name: `Variant ${String.fromCharCode(65 + variants.length - 1)}`, offering_id: '', weight: Math.max(remaining, 0) }]);
  };

  const removeVariant = (idx: number) => {
    if (variants.length <= 2) return;
    setVariants(variants.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, field: string, value: string | number) => {
    setVariants(variants.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalWeight !== 100) { setError('Weights must sum to 100'); return; }
    if (variants.some(v => !v.offering_id)) { setError('All variants must have an offering'); return; }
    setSaving(true);
    setError('');
    try {
      await api.createExperiment(appId, { name, description, variants });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create Experiment" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Input label="Name" value={name} onChange={setName} required placeholder="Pricing Test Q1" />
        <Input label="Description (optional)" value={description} onChange={setDescription} placeholder="Testing premium vs standard pricing" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Variants</label>
            <button type="button" onClick={addVariant} className="text-xs text-indigo-600 hover:text-indigo-700">
              <Plus className="w-3 h-3 inline mr-1" />Add Variant
            </button>
          </div>
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateVariant(i, 'name', e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                  placeholder="Variant name"
                />
                <select
                  value={v.offering_id}
                  onChange={(e) => updateVariant(i, 'offering_id', e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                >
                  <option value="">Select offering...</option>
                  {offerings.map((o) => <option key={o.id} value={o.id}>{o.identifier}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={v.weight}
                    onChange={(e) => updateVariant(i, 'weight', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded text-center"
                    min={0} max={100}
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
                {variants.length > 2 && (
                  <button type="button" onClick={() => removeVariant(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className={`text-xs mt-1 ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}>
            Total weight: {totalWeight}% {totalWeight !== 100 && '(must be 100%)'}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || totalWeight !== 100} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Experiment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
