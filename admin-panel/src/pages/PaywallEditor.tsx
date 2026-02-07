import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Smartphone, Monitor, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import Input from '../components/Input';

const TEMPLATE_TYPES = [
  { id: 'single', label: 'Single', desc: 'One subscription option' },
  { id: 'multi', label: 'Multi', desc: 'Multiple tiers' },
  { id: 'feature_list', label: 'Feature List', desc: 'Features with icons' },
  { id: 'comparison', label: 'Comparison', desc: 'Free vs Premium' },
  { id: 'minimal', label: 'Minimal', desc: 'Compact bottom sheet' },
];

const DEFAULT_CONFIG = {
  title: 'Unlock Premium',
  subtitle: 'Get access to all features',
  cta_text: 'Subscribe Now',
  close_button: true,
  features: ['Unlimited access', 'No ads', 'Priority support'],
  background_color: '#ffffff',
  primary_color: '#6366f1',
  text_color: '#111827',
  cta_color: '#6366f1',
  cta_text_color: '#ffffff',
};

export default function PaywallEditor() {
  const { id: appId, identifier } = useParams<{ id: string; identifier: string }>();
  const navigate = useNavigate();
  const isNew = identifier === 'new';

  const [name, setName] = useState('');
  const [paywallIdentifier, setPaywallIdentifier] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState('single');
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [offeringId, setOfferingId] = useState('');
  const [active, setActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [offerings, setOfferings] = useState<{ id: string; identifier: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'iphone' | 'android'>('iphone');
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (appId) {
      api.getOfferings(appId).then((res) => setOfferings(res.offerings || [])).catch(() => {});
    }
  }, [appId]);

  useEffect(() => {
    if (!isNew && appId && identifier) {
      api.getPaywalls(appId).then((res) => {
        const pw = res.paywalls.find((p: any) => p.identifier === identifier);
        if (pw) {
          setName(pw.name);
          setPaywallIdentifier(pw.identifier);
          setDescription(pw.description || '');
          setTemplateType(pw.template_type);
          setConfig({ ...DEFAULT_CONFIG, ...pw.config });
          setOfferingId(pw.offering_id || '');
          setActive(pw.active);
          setIsDefault(pw.is_default);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [appId, identifier]);

  const updateConfig = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!name || !paywallIdentifier) { setError('Name and identifier are required'); return; }
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        await api.createPaywall(appId!, {
          identifier: paywallIdentifier, name, description, template_type: templateType,
          config, offering_id: offeringId || undefined, active, is_default: isDefault,
        });
      } else {
        await api.updatePaywall(appId!, identifier!, {
          name, description, config, offering_id: offeringId || undefined,
          active, is_default: isDefault,
        });
      }
      navigate(`/apps/${appId}`, { state: { tab: 'paywalls' } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this paywall template?')) return;
    try {
      await api.deletePaywall(appId!, identifier!);
      navigate(`/apps/${appId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  }

  const deviceDimensions = previewDevice === 'iphone' ? { w: 375, h: 667 } : { w: 360, h: 640 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(`/apps/${appId}`)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'Create Paywall' : 'Edit Paywall'}</h1>
        </div>
        <div className="flex items-center space-x-2">
          {!isNew && (
            <button onClick={handleDelete} className="flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Editor */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Basic Info</h3>
            <Input label="Name" value={name} onChange={setName} required placeholder="Premium Paywall" />
            <Input label="Identifier" value={paywallIdentifier} onChange={setPaywallIdentifier} required placeholder="premium_paywall" />
            <Input label="Description" value={description} onChange={setDescription} placeholder="Main premium subscription paywall" />

            {isNew && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEMPLATE_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateType(t.id)}
                      className={`p-3 text-left rounded-lg border text-sm transition-colors ${
                        templateType === t.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offering</label>
              <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Default (current)</option>
                {offerings.map((o) => <option key={o.id} value={o.id}>{o.identifier}</option>)}
              </select>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mr-2" />
                Active
              </label>
              <label className="flex items-center text-sm">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="mr-2" />
                Default
              </label>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Content</h3>
            <Input label="Title" value={config.title} onChange={(v) => updateConfig('title', v)} placeholder="Unlock Premium" />
            <Input label="Subtitle" value={config.subtitle} onChange={(v) => updateConfig('subtitle', v)} placeholder="Get access to all features" />
            <Input label="CTA Text" value={config.cta_text} onChange={(v) => updateConfig('cta_text', v)} placeholder="Subscribe Now" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Features (one per line)</label>
              <textarea
                value={(config.features || []).join('\n')}
                onChange={(e) => updateConfig('features', e.target.value.split('\n').filter(Boolean))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Unlimited access&#10;No ads&#10;Priority support"
              />
            </div>
            <label className="flex items-center text-sm">
              <input type="checkbox" checked={config.close_button} onChange={(e) => updateConfig('close_button', e.target.checked)} className="mr-2" />
              Show close button
            </label>
          </div>

          {/* Style */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Style</h3>
            <div className="grid grid-cols-2 gap-4">
              <ColorPicker label="Background" value={config.background_color} onChange={(v) => updateConfig('background_color', v)} />
              <ColorPicker label="Primary" value={config.primary_color} onChange={(v) => updateConfig('primary_color', v)} />
              <ColorPicker label="Text" value={config.text_color} onChange={(v) => updateConfig('text_color', v)} />
              <ColorPicker label="CTA Background" value={config.cta_color} onChange={(v) => updateConfig('cta_color', v)} />
              <ColorPicker label="CTA Text" value={config.cta_text_color} onChange={(v) => updateConfig('cta_text_color', v)} />
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Preview</h3>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setPreviewDevice('iphone')}
                className={`px-3 py-1 text-xs rounded-md ${previewDevice === 'iphone' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                <Smartphone className="w-3 h-3 inline mr-1" />iPhone
              </button>
              <button
                onClick={() => setPreviewDevice('android')}
                className={`px-3 py-1 text-xs rounded-md ${previewDevice === 'android' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                <Monitor className="w-3 h-3 inline mr-1" />Android
              </button>
            </div>
          </div>

          {/* Device Frame */}
          <div className="flex justify-center">
            <div
              className="border-[8px] border-gray-800 rounded-[2rem] overflow-hidden shadow-2xl"
              style={{ width: deviceDimensions.w * 0.85, height: deviceDimensions.h * 0.85 }}
            >
              <div style={{ backgroundColor: config.background_color, color: config.text_color, height: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'system-ui' }}>
                {/* Close button */}
                {config.close_button && (
                  <div style={{ textAlign: 'right', opacity: 0.5, fontSize: '1.2rem' }}>&#10005;</div>
                )}

                {/* Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center' }}>{config.title}</h2>
                  <p style={{ fontSize: '0.875rem', textAlign: 'center', opacity: 0.7 }}>{config.subtitle}</p>

                  {/* Features */}
                  {templateType !== 'minimal' && config.features?.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      {config.features.map((f: string, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0', fontSize: '0.875rem' }}>
                          <span style={{ color: config.primary_color, marginRight: '0.5rem', fontSize: '1rem' }}>&#10003;</span>
                          {f}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Template-specific preview */}
                  {templateType === 'comparison' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div style={{ flex: 1, padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold' }}>Free</div>
                        <div style={{ opacity: 0.6, marginTop: '0.25rem' }}>Basic features</div>
                      </div>
                      <div style={{ flex: 1, padding: '0.75rem', border: `2px solid ${config.primary_color}`, borderRadius: '0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold', color: config.primary_color }}>Premium</div>
                        <div style={{ opacity: 0.6, marginTop: '0.25rem' }}>All features</div>
                      </div>
                    </div>
                  )}

                  {templateType === 'multi' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {['Monthly $9.99', 'Annual $79.99', 'Lifetime $199.99'].map((plan, i) => (
                        <div key={i} style={{
                          padding: '0.75rem',
                          border: i === 1 ? `2px solid ${config.primary_color}` : '1px solid #e5e7eb',
                          borderRadius: '0.5rem',
                          textAlign: 'center',
                          fontSize: '0.8rem',
                          fontWeight: i === 1 ? 'bold' : 'normal',
                        }}>
                          {plan}
                          {i === 1 && <div style={{ fontSize: '0.65rem', color: config.primary_color }}>Best Value</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div style={{ marginTop: '1rem' }}>
                  <button style={{
                    width: '100%', padding: '0.875rem', backgroundColor: config.cta_color,
                    color: config.cta_text_color, border: 'none', borderRadius: '0.75rem',
                    fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer',
                  }}>
                    {config.cta_text}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: '0.7rem', opacity: 0.5, marginTop: '0.5rem' }}>
                    Cancel anytime. Terms apply.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-300 cursor-pointer" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded" />
      </div>
    </div>
  );
}
