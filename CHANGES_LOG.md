# MenuItemFormModal — Changes Log

## File: `components/MenuItemFormModal.tsx`

---

### 1. Landscape / Portrait Orientation Detection

Added a `useEffect` hook that listens for device orientation changes using `matchMedia('(orientation: landscape)')` and stores the result in an `isLandscape` state variable.

```tsx
const [isLandscape, setIsLandscape] = useState(false);

useEffect(() => {
  const mql = window.matchMedia('(orientation: landscape)');
  const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsLandscape(e.matches);
  handler(mql);
  mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
  return () => mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
}, []);
```

---

### 2. Two-Column Landscape Layout

In landscape mode, the form is split into two independently scrollable columns so the user doesn't need to scroll vertically:

- **Left column**: Visual Asset, Menu Name/Description, Base Cost/Category
- **Right column**: Portion Sizes, Modifiers, Thermal Options, Variant Options, Add-Ons

```tsx
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
    {/* Original single-column layout */}
  </div>
)}
```

---

### 3. Responsive Modal Size

The modal adapts its width and height based on orientation:

| Property   | Portrait         | Landscape        |
|------------|------------------|------------------|
| Max Width  | `max-w-2xl`      | `max-w-5xl`      |
| Max Height | `max-h-[85vh]`   | `max-h-[95vh]`   |

---

### 4. Vertical Divider Between Columns (Landscape)

A thin separator line between the left and right columns in landscape mode:

```tsx
<div className="w-px bg-gray-200 dark:bg-gray-700 mx-3" />
```

Grid changed from `grid-cols-2` to `grid-cols-[1fr_auto_1fr]` to accommodate the divider, and the save button uses `col-span-3`.

---

### 5. Space Before Save Button

Added `mt-4` to the save button container for clear visual separation from the last form section:

```tsx
<div className={`pt-4 mt-4 border-t dark:border-gray-700 ${isLandscape ? 'col-span-3' : ''}`}>
```

---

### 6. Title Text Update

Changed from:
```
Menu Editor
```
To:
```
Menu Editor - Add Or Edit Menu
```

---

### 7. Modifier Label Text Update

Changed from:
```
Select modifiers (max 4) — 0/4 active
```
To:
```
Select or add modifiers (max 4) — 0/4 active
```

---

### 8. Upload Frame Height Alignment (Landscape)

In landscape mode, the upload frame image area stretches to match the height of the right-side toggles (down to the Variant Options row) instead of being a fixed aspect ratio:

```tsx
<div className={`... ${isLandscape ? 'flex-1' : 'aspect-video'}`}>
```

The parent `<div>` was changed to `flex flex-col` so `flex-1` can take effect.

---

### 9. Compact Landscape Adjustments

- Description textarea reduced to `rows={1}` in landscape (vs `rows={2}` in portrait)
- Section border-top dividers removed in landscape for tighter spacing
- Add-on cards use `p-3` padding in landscape (vs `p-4` in portrait)
- Empty add-ons placeholder uses `py-4` in landscape (vs `py-6` in portrait)
- Close button given `z-10` to stay above scrollable content
