import React, { useEffect, useRef, useState } from 'react';
import { MenuItem, AddOnItem, ModifierData } from '../src/types';
import { X, Plus, Trash2, ThermometerSun, Info, Image as ImageIcon, PlusCircle, Save, Pencil, Package, ScanBarcode, DollarSign, Tag, Layers, ChevronDown } from 'lucide-react';
import { toast } from './Toast';
import ImageCropModal from './ImageCropModal';

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
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [localCategories, setLocalCategories] = useState<string[]>(categories);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleCropApply = (blob: Blob) => {
    const croppedFile = new File([blob], cropFile?.name ?? 'image.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(croppedFile);
    const syntheticEvent = { target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>;
    setCropFile(null);
    onImageUpload?.(syntheticEvent);
  };

  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsLandscape(e.matches);
    handler(mql);
    mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLocalCategories(categories);
      setIsAddingCategory(false);
      setNewCategoryName('');
      // Default to "No Category" if no category set
      if (!formItem.category) {
        setFormItem(prev => ({ ...prev, category: 'No Category' }));
      }
      const count = formItem.addOns?.length ?? 0;
      if (count > 0) {
        setCollapsedAddOns(new Set(Array.from({ length: count }, (_, i) => i)));
      } else {
        setCollapsedAddOns(new Set());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
      <h3 className="text-sm font-black dark:text-white mb-3">Image</h3>
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
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
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
        </div>
      </div>
    </div>
  );

  // ─── Item Details (Loyverse section 1) ───
  const itemDetailsSection = (
    <div className="space-y-4">
      <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><Tag size={16} className="text-amber-500" /> Item Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Name *</label>
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
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Category *</label>
          <select
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
            value={isAddingCategory ? '__add_new__' : (formItem.category || 'No Category')}
            onChange={e => {
              if (e.target.value === '__add_new__') {
                setIsAddingCategory(true);
              } else {
                setFormItem(prev => ({ ...prev, category: e.target.value }));
              }
            }}
          >
            <option value="No Category">No Category</option>
            {localCategories.filter(c => c !== 'All' && c !== 'No Category').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="__add_new__">＋ Add new category...</option>
          </select>
          {isAddingCategory && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                type="text"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-amber-400 dark:border-amber-500 rounded-lg outline-none font-bold dark:text-white text-sm focus:ring-2 focus:ring-amber-500"
                placeholder="New category name"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    e.preventDefault();
                    const name = newCategoryName.trim();
                    if (!localCategories.includes(name)) setLocalCategories(prev => [...prev, name]);
                    setFormItem(prev => ({ ...prev, category: name }));
                    setIsAddingCategory(false);
                    setNewCategoryName('');
                  } else if (e.key === 'Escape') {
                    setIsAddingCategory(false);
                    setNewCategoryName('');
                    setFormItem(prev => ({ ...prev, category: prev.category || 'No Category' }));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const name = newCategoryName.trim();
                  if (name) {
                    if (!localCategories.includes(name)) setLocalCategories(prev => [...prev, name]);
                    setFormItem(prev => ({ ...prev, category: name }));
                  } else {
                    setFormItem(prev => ({ ...prev, category: prev.category || 'No Category' }));
                  }
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                }}
                className="px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all"
              >Add</button>
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Description</label>
        <textarea
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm resize-none"
          rows={2}
          value={formItem.description}
          onChange={e => setFormItem(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe the ingredients and preparation..."
        />
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="availableForSale"
          checked={!formItem.isArchived}
          onChange={e => setFormItem(prev => ({ ...prev, isArchived: !e.target.checked }))}
          className="w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500"
        />
        <label htmlFor="availableForSale" className="text-xs font-bold text-gray-600 dark:text-gray-300">The item is available for sale</label>
      </div>
    </div>
  );

  // ─── Selling Information (Loyverse section 2) ───
  const sellingInfoSection = (
    <div className="space-y-4 border-t dark:border-gray-700 pt-4">
      <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><DollarSign size={16} className="text-amber-500" /> Selling Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Sold By</label>
          <div className="flex gap-2">
            {(['each', 'weight'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setFormItem(prev => ({ ...prev, soldBy: opt }))}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all whitespace-nowrap ${
                  (formItem.soldBy || 'each') === opt
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'
                }`}
              >
                {opt === 'each' ? 'Each' : 'Weight / Volume'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Price *</label>
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
      </div>
    </div>
  );

  // ─── Cost & Identification (Loyverse section 3) ───
  const costIdSection = (
    <div className="space-y-4 border-t dark:border-gray-700 pt-4">
      <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><ScanBarcode size={16} className="text-amber-500" /> Cost & Identification</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Cost</label>
          <input
            type="number"
            step="0.01"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
            value={formItem.cost === 0 || formItem.cost === undefined ? '' : formItem.cost}
            onChange={e => setFormItem(prev => ({ ...prev, cost: e.target.value === '' ? 0 : Number(e.target.value) }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">SKU</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
            value={formItem.sku || ''}
            onChange={e => setFormItem(prev => ({ ...prev, sku: e.target.value }))}
            placeholder="e.g. ITEM-001"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Barcode</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
            value={formItem.barcode || ''}
            onChange={e => setFormItem(prev => ({ ...prev, barcode: e.target.value }))}
            placeholder="Scan or type barcode"
          />
        </div>
      </div>
    </div>
  );

  // ─── Inventory (Loyverse section 4) ───
  const inventorySection = (
    <div className="space-y-4 border-t dark:border-gray-700 pt-4">
      <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><Package size={16} className="text-amber-500" /> Inventory</h3>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="trackStock"
          checked={formItem.trackStock || false}
          onChange={e => setFormItem(prev => ({ ...prev, trackStock: e.target.checked }))}
          className="w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500"
        />
        <label htmlFor="trackStock" className="text-xs font-bold text-gray-600 dark:text-gray-300">Track stock</label>
        <div className="relative group">
          <Info size={14} className="text-gray-400 cursor-help" />
          <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 w-48 p-2 bg-gray-800 text-white text-[10px] rounded-lg shadow-lg z-10">
            Enable to track inventory levels for this item in Stock Management.
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Variants & Modifiers header (Loyverse section 5) ───
  const variantsModifiersHeader = (
    <div className="space-y-3 border-t dark:border-gray-700 pt-4">
      <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><Layers size={16} className="text-amber-500" /> Variants & Modifiers</h3>
      <div className="flex flex-wrap gap-4">
        {([
          { label: 'Portion Sizes', enabled: !!formItem.sizesEnabled, toggle: () => setFormItem(prev => ({ ...prev, sizesEnabled: !prev.sizesEnabled })) },
          { label: 'Thermal', enabled: !!formItem.tempOptions?.enabled, toggle: () => setFormItem(prev => ({ ...prev, tempOptions: { ...(prev.tempOptions || { hot: 0, cold: 0, enabled: false, options: [] }), enabled: !prev.tempOptions?.enabled } })) },
          { label: 'Variants', enabled: !!formItem.variantOptions?.enabled, toggle: () => setFormItem(prev => ({ ...prev, variantOptions: { ...(prev.variantOptions || { enabled: false, options: [] }), enabled: !prev.variantOptions?.enabled } })) },
        ] as { label: string; enabled: boolean; toggle: () => void }[]).map(({ label, enabled, toggle }) => (
          <button key={label} type="button" onClick={toggle} className="flex items-center gap-2 group">
            <div className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest ${enabled ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>{label}</span>
          </button>
        ))}
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
    <div className="pt-4 mt-4 border-t dark:border-gray-700">
      <button type="submit" className="w-full py-3 bg-orange-500 text-white rounded-lg font-black uppercase tracking-[0.15em] text-xs shadow hover:bg-orange-600 transition-all active:scale-95">
        Save Changes
      </button>
    </div>
  );

  return (
    <>
    {cropFile && (
      <ImageCropModal
        imageFile={cropFile}
        onCrop={handleCropApply}
        onCancel={() => setCropFile(null)}
      />
    )}
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-2 md:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-6xl w-full max-h-[95vh] p-4 md:p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300 overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={20} /></button>
        <h2 className="text-lg font-black mb-4 dark:text-white uppercase tracking-tighter">{formItem.id ? 'Edit Item' : 'Add Item'}</h2>

        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0">
            {/* Left column — Details & Selling */}
            <div className="space-y-4 overflow-y-auto lg:max-h-[calc(95vh-10rem)] lg:pr-4">
              {visualAssetSection}
              {itemDetailsSection}
              {sellingInfoSection}
              {costIdSection}
              {inventorySection}
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 mx-3" />
            <hr className="lg:hidden border-gray-200 dark:border-gray-700 my-2" />

            {/* Right column — Variants & Modifiers */}
            <div className="space-y-4 overflow-y-auto lg:max-h-[calc(95vh-10rem)] lg:pl-4">
              {variantsModifiersHeader}
              {sizesSection}
              {modifiersSection}
              {thermalSection}
              {variantSection}
              {addOnsSection}
            </div>
          </div>
          {saveButton}
        </form>
      </div>
    </div>
    </>
  );
};

export default MenuItemFormModal;
