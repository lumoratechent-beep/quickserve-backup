import React, { useRef } from 'react';
import { MenuItem, AddOnItem } from '../src/types';
import { X, Plus, Trash2, ThermometerSun, Info, Image as ImageIcon, PlusCircle } from 'lucide-react';

export type MenuFormItem = Partial<MenuItem & { sizesEnabled?: boolean }>;

interface Props {
  isOpen: boolean;
  formItem: MenuFormItem;
  setFormItem: React.Dispatch<React.SetStateAction<MenuFormItem>>;
  categories: string[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const MenuItemFormModal: React.FC<Props> = ({
  isOpen,
  formItem,
  setFormItem,
  categories,
  onClose,
  onSubmit,
  onImageUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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

  const handleAddOtherVariant = () => {
    setFormItem(prev => ({
      ...prev,
      otherVariants: [...(prev.otherVariants || []), { name: '', price: 0 }],
    }));
  };

  const handleRemoveOtherVariant = (index: number) => {
    setFormItem(prev => ({
      ...prev,
      otherVariants: prev.otherVariants?.filter((_, i) => i !== index),
    }));
  };

  const handleOtherVariantChange = (index: number, field: 'name' | 'price', value: string | number) => {
    setFormItem(prev => {
      const updated = [...(prev.otherVariants || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, otherVariants: updated };
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
  };

  const handleAddOnChange = (index: number, field: keyof AddOnItem, value: string | number | boolean) => {
    setFormItem(prev => {
      const updated = [...(prev.addOns || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, addOns: updated };
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={20} /></button>
        <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">New Dish Broadcast</h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="border-b dark:border-gray-700 pb-4">
            <h3 className="text-sm font-black dark:text-white mb-3">Visual Asset</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="relative group aspect-video rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
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
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Portion Variants</span>
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
                    onClick={() => setFormItem(prev => ({ ...prev, tempOptions: { ...(prev.tempOptions || { hot: 0, cold: 0, enabled: false }), enabled: !prev.tempOptions?.enabled } }))}
                    className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${formItem.tempOptions?.enabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                  >
                    {formItem.tempOptions?.enabled ? 'Activated' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          </div>

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
                rows={2}
                value={formItem.description}
                onChange={e => setFormItem(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the ingredients and preparation..."
              />
            </div>
          </div>

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
                value={formItem.category}
                onChange={e => setFormItem(prev => ({ ...prev, category: e.target.value }))}
              >
                {categories.filter(c => c !== 'All').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {formItem.sizesEnabled && (
            <div className="border-t dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black dark:text-white">Portion Variants</h3>
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
          )}

          <div className="border-t dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black dark:text-white">Modifier</h3>
              <button type="button" onClick={handleAddOtherVariant} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <Plus size={16} />
              </button>
            </div>

            {formItem.otherVariants && formItem.otherVariants.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Modifier Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none font-bold dark:text-white text-sm"
                    value={formItem.otherVariantName}
                    onChange={e => setFormItem(prev => ({ ...prev, otherVariantName: e.target.value, otherVariantsEnabled: true }))}
                    placeholder="e.g. Sugar Level"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{formItem.otherVariants.length} Options</span>
                  </div>
                  {formItem.otherVariants.map((variant, idx) => (
                    <div key={idx} className="flex gap-2 items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                        placeholder="Option name"
                        value={variant.name}
                        onChange={e => handleOtherVariantChange(idx, 'name', e.target.value)}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                        placeholder="+Price"
                        value={variant.price === 0 ? '' : variant.price}
                        onChange={e => handleOtherVariantChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                      <button type="button" onClick={() => handleRemoveOtherVariant(idx)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg border-2 border-dashed border-gray-200">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">0 Options</p>
                <p className="text-[8px] text-gray-400 mt-1">Click + to add modifier options</p>
              </div>
            )}
          </div>

          {formItem.tempOptions?.enabled && (
            <div className="border-t dark:border-gray-700 pt-4">
              <h3 className="text-sm font-black dark:text-white mb-3">Thermal Options</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-orange-500">
                    <ThermometerSun size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Hot Surcharge</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                    value={formItem.tempOptions.hot === 0 ? '' : formItem.tempOptions.hot}
                    onChange={e => setFormItem(prev => ({ ...prev, tempOptions: { ...(prev.tempOptions || { enabled: true, hot: 0, cold: 0 }), hot: e.target.value === '' ? 0 : Number(e.target.value), enabled: true } }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-500">
                    <Info size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Cold Surcharge</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 bg-blue-50 dark:bg-blue-900/10 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white"
                    value={formItem.tempOptions.cold === 0 ? '' : formItem.tempOptions.cold}
                    onChange={e => setFormItem(prev => ({ ...prev, tempOptions: { ...(prev.tempOptions || { enabled: true, hot: 0, cold: 0 }), cold: e.target.value === '' ? 0 : Number(e.target.value), enabled: true } }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="border-t dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black dark:text-white">Add-On Items</h3>
              <button type="button" onClick={handleAddAddOn} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <Plus size={16} />
              </button>
            </div>

            {formItem.addOns && formItem.addOns.length > 0 ? (
              <div className="space-y-3">
                {formItem.addOns.map((addon, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg border-2 border-dashed border-gray-200">
                <PlusCircle size={24} className="mx-auto text-gray-400 mb-2" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No add-ons added yet</p>
                <p className="text-[8px] text-gray-400 mt-1">Click + to add optional items</p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t dark:border-gray-700">
            <button type="submit" className="w-full py-3 bg-orange-500 text-white rounded-lg font-black uppercase tracking-[0.15em] text-xs shadow hover:bg-orange-600 transition-all active:scale-95">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MenuItemFormModal;
