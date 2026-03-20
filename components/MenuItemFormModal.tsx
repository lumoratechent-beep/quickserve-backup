import React, { useEffect, useRef, useState } from 'react';
import { MenuItem, AddOnItem, ModifierData } from '../src/types';
import { X, Plus, Trash2, ThermometerSun, Info, Image as ImageIcon, PlusCircle, Save, Pencil } from 'lucide-react';
import { toast } from './Toast';

export type MenuFormItem = Partial<MenuItem & { sizesEnabled?: boolean; variantOptionsEnabled?: boolean }>;

interface Props {
  isOpen: boolean;
  formItem: MenuFormItem;
  setFormItem: React.Dispatch<React.SetStateAction<MenuFormItem>>;
  categories: string[];
  availableModifiers?: ModifierData[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveModifier?: (modifier: ModifierData) => void;
}

const MenuItemFormModal: React.FC<Props> = ({
  isOpen,
  formItem,
  setFormItem,
  categories,
  availableModifiers = [],
  onClose,
  onSubmit,
  onImageUpload,
  onSaveModifier,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewModifierForm, setShowNewModifierForm] = useState(false);
  const [collapsedAddOns, setCollapsedAddOns] = useState<Set<number>>(new Set());
  const [newModName, setNewModName] = useState('');
  const [newModOptions, setNewModOptions] = useState<{ name: string; price: number }[]>([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsLandscape(e.matches);
    handler(mql);
    mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  if (!isOpen) return null;

  const linkedModifiers = formItem.linkedModifiers || [];

  const handleToggleModifier = (modName: string) => {
    if (linkedModifiers.includes(modName)) {
      setFormItem(prev => ({
        ...prev,
        linkedModifiers: (prev.linkedModifiers || []).filter(n => n !== modName),
      }));
    } else {
      if (linkedModifiers.length >= 4) {
        toast('Maximum 4 modifiers per item.', 'warning');
        return;
      }
      setFormItem(prev => ({
        ...prev,
        linkedModifiers: [...(prev.linkedModifiers || []), modName],
      }));
    }
  };

  const handleRemoveLinkedModifier = (modName: string) => {
    setFormItem(prev => ({
      ...prev,
      linkedModifiers: (prev.linkedModifiers || []).filter(n => n !== modName),
    }));
  };

  const handleOpenNewModifierForm = () => {
    setShowNewModifierForm(true);
    setNewModName('');
    setNewModOptions([]);
    setNewOptionName('');
    setNewOptionPrice(0);
  };

  const handleAddNewModOption = () => {
    const name = newOptionName.trim();
    if (!name) return;
    setNewModOptions(prev => [...prev, { name, price: newOptionPrice || 0 }]);
    setNewOptionName('');
    setNewOptionPrice(0);
  };

  const handleSaveNewModifier = () => {
    const name = newModName.trim();
    if (!name) {
      toast('Please enter a modifier name.', 'warning');
      return;
    }
    if (availableModifiers.some(m => m.name === name)) {
      toast('A modifier with this name already exists.', 'warning');
      return;
    }
    const validOptions = newModOptions.filter(o => o.name.trim() !== '');
    if (onSaveModifier) {
      onSaveModifier({ name, options: validOptions, required: false });
    }
    // Auto-link the newly created modifier if under limit
    if (linkedModifiers.length < 4) {
      setFormItem(prev => ({
        ...prev,
        linkedModifiers: [...(prev.linkedModifiers || []), name],
      }));
    }
    setShowNewModifierForm(false);
    setNewModName('');
    setNewModOptions([]);
  };

  const handleAddSize = () => {
    setFormItem(prev => ({
      ...prev,
      sizes: [...(prev.sizes || []), { name: '', price: 0 }],
    }));
  };

  const handleRemoveSize = (index: number) => {
    setFormItem(prev => ({
      ...prev,
      sizes: prev.sizes?.filter((_, i) => i !== index),
    }));
  };

  const handleSizeChange = (index: number, field: 'name' | 'price', value: string | number) => {
    setFormItem(prev => {
      const updatedSizes = [...(prev.sizes || [])];
      updatedSizes[index] = { ...updatedSizes[index], [field]: value };
      return { ...prev, sizes: updatedSizes };
    });
  };

  const handleAddTempOption = () => {
    setFormItem(prev => ({
      ...prev,
      tempOptions: {
        ...(prev.tempOptions || { enabled: true, hot: 0, cold: 0 }),
        options: [...(prev.tempOptions?.options || []), { name: '', price: 0 }],
      },
    }));
  };

  const handleRemoveTempOption = (index: number) => {
    setFormItem(prev => ({
      ...prev,
      tempOptions: {
        ...(prev.tempOptions || { enabled: true, hot: 0, cold: 0 }),
        options: (prev.tempOptions?.options || []).filter((_, i) => i !== index),
      },
    }));
  };

  const handleTempOptionChange = (index: number, field: 'name' | 'price', value: string | number) => {
    setFormItem(prev => {
      const updated = [...(prev.tempOptions?.options || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, tempOptions: { ...(prev.tempOptions || { enabled: true, hot: 0, cold: 0 }), options: updated } };
    });
  };

  const handleAddVariantOption = () => {
    setFormItem(prev => ({
      ...prev,
      variantOptions: {
        ...(prev.variantOptions || { enabled: true, options: [] }),
        options: [...(prev.variantOptions?.options || []), { name: '', price: 0 }],
      },
    }));
  };

  const handleRemoveVariantOption = (index: number) => {
    setFormItem(prev => ({
      ...prev,
      variantOptions: {
        ...(prev.variantOptions || { enabled: true, options: [] }),
        options: (prev.variantOptions?.options || []).filter((_, i) => i !== index),
      },
    }));
  };

  const handleVariantOptionChange = (index: number, field: 'name' | 'price', value: string | number) => {
    setFormItem(prev => {
      const updated = [...(prev.variantOptions?.options || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, variantOptions: { ...(prev.variantOptions || { enabled: true, options: [] }), options: updated } };
    });
  };

  const handleAddAddOn = () => {
    setFormItem(prev => ({
      ...prev,
      addOns: [...(prev.addOns || []), { name: '', price: 0, maxQuantity: 1, required: false }],
    }));
  };

  const handleRemoveAddOn = (index: number) => {
    setFormItem(prev => ({
      ...prev,
      addOns: prev.addOns?.filter((_, i) => i !== index),
    }));
    setCollapsedAddOns(prev => {
      const reindexed = new Set<number>();
      prev.forEach(i => {
        if (i < index) reindexed.add(i);
        else if (i > index) reindexed.add(i - 1);
      });
      return reindexed;
    });
  };

  const handleAddOnChange = (index: number, field: keyof AddOnItem, value: string | number | boolean) => {
    setFormItem(prev => {
      const updated = [...(prev.addOns || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, addOns: updated };
    });
  };

  const visualAssetSection = (
    <div className={`${isLandscape ? '' : 'border-b dark:border-gray-700'} pb-4`}>
      <h3 className="text-sm font-black dark:text-white mb-3">Visual Asset</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={isLandscape ? 'flex flex-col' : ''}>
          <div
            className={`relative group ${isLandscape ? 'flex-1' : 'aspect-video'} rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center cursor-pointer`}
            onClick={() => fileInputRef.current?.click()}
          >
            {formItem.image ? (
              <img src={formItem.image} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
            ) : (
              <div className="text-center">
                <ImageIcon size={24} className="mx-auto text-gray-300 mb-1" />
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Upload Frame</span>
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Or Image URL</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
            value={formItem.image}
            onChange={e => setFormItem(prev => ({ ...prev, image: e.target.value }))}
            placeholder="Paste link here..."
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Portion Size</span>
            <button
              type="button"
              onClick={() => setFormItem(prev => ({ ...prev, sizesEnabled: !prev.sizesEnabled }))}
              className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${formItem.sizesEnabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              {formItem.sizesEnabled ? 'Activated' : 'Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Thermal Options</span>
            <button
              type="button"
              onClick={() => setFormItem(prev => ({ ...prev, tempOptions: { ...(prev.tempOptions || { hot: 0, cold: 0, enabled: false, options: [] }), enabled: !prev.tempOptions?.enabled } }))}
              className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${formItem.tempOptions?.enabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              {formItem.tempOptions?.enabled ? 'Activated' : 'Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Variant Options</span>
            <button
              type="button"
              onClick={() => setFormItem(prev => ({ ...prev, variantOptions: { ...(prev.variantOptions || { enabled: false, options: [] }), enabled: !prev.variantOptions?.enabled } }))}
              className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${formItem.variantOptions?.enabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              {formItem.variantOptions?.enabled ? 'Activated' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const nameDescSection = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Menu Name</label>
        <input
          required
          type="text"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
          value={formItem.name}
          onChange={e => setFormItem(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g. Signature Beef Burger"
        />
      </div>
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Description</label>
        <textarea
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm resize-none"
          rows={isLandscape ? 1 : 2}
          value={formItem.description}
          onChange={e => setFormItem(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe the ingredients and preparation..."
        />
      </div>
    </div>
  );

  const priceCategorySection = (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Cost</label>
        <input
          required
          type="number"
          step="0.01"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
          value={formItem.price === 0 ? '' : formItem.price}
          onChange={e => setFormItem(prev => ({ ...prev, price: e.target.value === '' ? 0 : Number(e.target.value) }))}
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Category</label>
        <select
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
          value={formItem.category || ''}
          onChange={e => setFormItem(prev => ({ ...prev, category: e.target.value }))}
        >
          {!formItem.category && <option value="">-- Select Category --</option>}
          {categories.filter(c => c !== 'All').map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const sizesSection = formItem.sizesEnabled ? (
    <div className={`${isLandscape ? '' : 'border-t dark:border-gray-700'} pt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black dark:text-white">Portion Size</h3>
        <button type="button" onClick={handleAddSize} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {formItem.sizes?.map((size, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="Size name"
              value={size.name}
              onChange={e => handleSizeChange(idx, 'name', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="+Price"
              value={size.price === 0 ? '' : size.price}
              onChange={e => handleSizeChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <button type="button" onClick={() => handleRemoveSize(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const modifiersSection = (
    <div className={`${isLandscape ? '' : 'border-t dark:border-gray-700'} pt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black dark:text-white">Modifier</h3>
        <button type="button" onClick={handleOpenNewModifierForm} title="Create a new modifier" className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <Plus size={16} />
        </button>
      </div>

      {availableModifiers.length > 0 && (
        <div className="mb-4">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Select or add modifiers (max 4) — {linkedModifiers.length}/4 active
          </label>
          <div className="flex flex-wrap gap-2">
            {availableModifiers.map(mod => {
              const isActive = linkedModifiers.includes(mod.name);
              return (
                <button
                  key={mod.name}
                  type="button"
                  onClick={() => handleToggleModifier(mod.name)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-wide transition-all border flex items-center gap-1 ${
                    isActive
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-orange-300'
                  }`}
                >
                  <span>{mod.name} ({mod.options.length})</span>
                  {isActive && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveLinkedModifier(mod.name);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRemoveLinkedModifier(mod.name);
                        }
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 hover:bg-white/30"
                      aria-label={`Unselect ${mod.name}`}
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {availableModifiers.length === 0 && !showNewModifierForm && (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No modifiers</p>
          <p className="text-[8px] text-gray-400 mt-1">Click + to create a new modifier</p>
        </div>
      )}

      {showNewModifierForm && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600 space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowNewModifierForm(false)} className="p-1 text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">New Modifier Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
              value={newModName}
              onChange={e => setNewModName(e.target.value)}
              placeholder="e.g. Sugar Level"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{newModOptions.length} Options</span>
            {newModOptions.map((opt, idx) => (
              <div key={idx} className="flex gap-2 items-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                <span className="flex-1 text-xs font-bold dark:text-white">{opt.name}</span>
                <span className="text-xs text-gray-400">{opt.price > 0 ? `+RM${opt.price}` : 'Free'}</span>
                <button type="button" onClick={() => setNewModOptions(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                placeholder="Option name"
                value={newOptionName}
                onChange={e => setNewOptionName(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                className="w-24 px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                placeholder="+Price"
                value={newOptionPrice === 0 ? '' : newOptionPrice}
                onChange={e => setNewOptionPrice(e.target.value === '' ? 0 : Number(e.target.value))}
              />
              <button
                type="button"
                onClick={handleAddNewModOption}
                disabled={!newOptionName.trim()}
                className="px-3 py-2 rounded-lg text-[9px] font-black bg-orange-500 text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveNewModifier}
            disabled={!newModName.trim()}
            className="w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
          >
            <Save size={14} /> Save Modifier
          </button>
        </div>
      )}
    </div>
  );

  const thermalSection = formItem.tempOptions?.enabled ? (
    <div className={`${isLandscape ? '' : 'border-t dark:border-gray-700'} pt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black dark:text-white">Thermal Options</h3>
        <button type="button" onClick={handleAddTempOption} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {formItem.tempOptions.options?.map((opt, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="e.g. Hot, Cold, Warm"
              value={opt.name}
              onChange={e => handleTempOptionChange(idx, 'name', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="+Price"
              value={opt.price === 0 ? '' : opt.price}
              onChange={e => handleTempOptionChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <button type="button" onClick={() => handleRemoveTempOption(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const variantSection = formItem.variantOptions?.enabled ? (
    <div className={`${isLandscape ? '' : 'border-t dark:border-gray-700'} pt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black dark:text-white">Variant Options</h3>
        <button type="button" onClick={handleAddVariantOption} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {formItem.variantOptions.options?.map((opt, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="Option name"
              value={opt.name}
              onChange={e => handleVariantOptionChange(idx, 'name', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
              placeholder="+Price"
              value={opt.price === 0 ? '' : opt.price}
              onChange={e => handleVariantOptionChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <button type="button" onClick={() => handleRemoveVariantOption(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const addOnsSection = (
    <div className={`${isLandscape ? '' : 'border-t dark:border-gray-700'} pt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black dark:text-white">Add-On Items</h3>
        <button type="button" onClick={handleAddAddOn} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <Plus size={16} />
        </button>
      </div>

      {formItem.addOns && formItem.addOns.length > 0 ? (
        <div className="space-y-3">
          {formItem.addOns.map((addon, idx) => (
            collapsedAddOns.has(idx) ? (
              <div key={idx} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold dark:text-white truncate">{addon.name || `Add-On #${idx + 1}`}</span>
                  {addon.price > 0 && <span className="shrink-0 text-[9px] text-gray-400">+RM{addon.price.toFixed(2)}</span>}
                  {addon.required && <span className="shrink-0 text-[8px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-black uppercase">Required</span>}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => setCollapsedAddOns(prev => { const n = new Set(prev); n.delete(idx); return n; })}
                    className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg"
                  >
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => handleRemoveAddOn(idx)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div key={idx} className={`${isLandscape ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Add-On #{idx + 1}</span>
                  <button type="button" onClick={() => handleRemoveAddOn(idx)} className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</label>
                    <input
                      type="text"
                      value={addon.name}
                      onChange={(e) => handleAddOnChange(idx, 'name', e.target.value)}
                      placeholder="e.g. Extra Cheese"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Price (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={addon.price}
                      onChange={(e) => handleAddOnChange(idx, 'price', parseFloat(e.target.value) || 0)}
                      placeholder="2.00"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Max Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={addon.maxQuantity}
                      onChange={(e) => handleAddOnChange(idx, 'maxQuantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id={`required-${idx}`}
                      checked={addon.required || false}
                      onChange={(e) => handleAddOnChange(idx, 'required', e.target.checked)}
                      className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                    />
                    <label htmlFor={`required-${idx}`} className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Required</label>
                    <button
                      type="button"
                      onClick={() => setCollapsedAddOns(prev => new Set(prev).add(idx))}
                      className="ml-auto px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors"
                    >
                      <Save size={11} /> Save
                    </button>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        <div className={`text-center ${isLandscape ? 'py-4' : 'py-6'} bg-gray-50 dark:bg-gray-700/30 rounded-lg border-2 border-dashed border-gray-200`}>
          <PlusCircle size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No add-ons added yet</p>
          <p className="text-[8px] text-gray-400 mt-1">Click + to add optional items</p>
        </div>
      )}
    </div>
  );

  const saveButton = (
    <div className={`pt-4 mt-4 border-t dark:border-gray-700 ${isLandscape ? 'col-span-3' : ''}`}>
      <button type="submit" className="w-full py-3 bg-orange-500 text-white rounded-lg font-black uppercase tracking-[0.15em] text-xs shadow hover:bg-orange-600 transition-all active:scale-95">
        Save Changes
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl ${isLandscape ? 'max-w-5xl max-h-[95vh]' : 'max-w-2xl max-h-[85vh]'} w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300 overflow-y-auto`}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={20} /></button>
        <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">Menu Editor - Add Or Edit Menu</h2>

        <form onSubmit={onSubmit}>
          {isLandscape ? (
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-0">
              <div className="space-y-3 overflow-y-auto max-h-[calc(95vh-8rem)] pr-4">
                {visualAssetSection}
                {nameDescSection}
                {priceCategorySection}
              </div>
              <div className="w-px bg-gray-200 dark:bg-gray-700 mx-3" />
              <div className="space-y-3 overflow-y-auto max-h-[calc(95vh-8rem)] pl-4">
                {sizesSection}
                {modifiersSection}
                {thermalSection}
                {variantSection}
                {addOnsSection}
              </div>
              {saveButton}
            </div>
          ) : (
            <div className="space-y-4">
              {visualAssetSection}
              {nameDescSection}
              {priceCategorySection}
              {sizesSection}
              {modifiersSection}
              {thermalSection}
              {variantSection}
              {addOnsSection}
              {saveButton}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default MenuItemFormModal;
