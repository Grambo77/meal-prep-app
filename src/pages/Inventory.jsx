import React, { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader, DecodeHintType } from '@zxing/library'
import { supabase } from '../supabaseClient'

function Inventory() {
  const [inventory, setInventory] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)

  // Manual add state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addIngredientId, setAddIngredientId] = useState('')
  const [addQuantity, setAddQuantity] = useState('')
  const [addUnit, setAddUnit] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Barcode scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [scanStatus, setScanStatus] = useState('Initializing camera...')
  const [scannedProduct, setScannedProduct] = useState(null)
  const [scanQuantity, setScanQuantity] = useState('1')
  const [scanUnit, setScanUnit] = useState('')
  const [scanIngredientName, setScanIngredientName] = useState('')
  const [scanSaving, setScanSaving] = useState(false)
  const [scanError, setScanError] = useState('')

  const videoRef = useRef(null)
  const codeReaderRef = useRef(null)
  const hasScannedRef = useRef(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [{ data: invData }, { data: ingData }] = await Promise.all([
        supabase
          .from('inventory')
          .select('*, ingredient:ingredients(id, name, category)')
          .order('updated_at', { ascending: false }),
        supabase
          .from('ingredients')
          .select('id, name, category')
          .order('name'),
      ])
      setInventory(invData || [])
      setIngredients(ingData || [])
    } catch (err) {
      console.error('Error loading inventory:', err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Manual Add ──────────────────────────────────────────────────────────────

  const filteredIngredients = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  async function handleManualSave() {
    if (!addQuantity) return
    setSaving(true)
    try {
      let ingredientId = addIngredientId

      // If no existing ingredient selected, create a new one from the search text
      if (!ingredientId && addSearch.trim()) {
        const { data: newIng, error: ingErr } = await supabase
          .from('ingredients')
          .insert({ name: addSearch.trim(), category: 'pantry', storage_location: 'pantry' })
          .select('id')
          .single()
        if (ingErr) throw ingErr
        ingredientId = newIng.id
      }

      if (!ingredientId) return

      const { error } = await supabase
        .from('inventory')
        .upsert(
          { ingredient_id: ingredientId, quantity: parseFloat(addQuantity), unit: addUnit },
          { onConflict: 'ingredient_id' }
        )
      if (error) throw error
      setShowAddForm(false)
      setAddIngredientId('')
      setAddQuantity('')
      setAddUnit('')
      setAddSearch('')
      await loadData()
    } catch (err) {
      console.error('Error saving inventory item:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Inline quantity edit ─────────────────────────────────────────────────

  async function handleQuantityEdit(invId, newQty) {
    const qty = parseFloat(newQty)
    if (isNaN(qty)) return
    try {
      await supabase
        .from('inventory')
        .update({ quantity: Math.max(0, qty) })
        .eq('id', invId)
      await loadData()
    } catch (err) {
      console.error('Error updating quantity:', err)
    }
  }

  async function handleDelete(ingredientId) {
    try {
      await supabase.from('inventory').delete().eq('ingredient_id', ingredientId)
      await loadData()
    } catch (err) {
      console.error('Error deleting inventory item:', err)
    }
  }

  // ─── Barcode Scanner ──────────────────────────────────────────────────────

  async function startScanner() {
    setShowScanner(true)
    setScannedProduct(null)
    setScanError('')
    setScanStatus('Initializing camera...')
    hasScannedRef.current = false
  }

  useEffect(() => {
    if (!showScanner || scannedProduct) return

    const hints = new Map()
    hints.set(DecodeHintType.TRY_HARDER, true)
    const codeReader = new BrowserMultiFormatReader(hints)
    codeReaderRef.current = codeReader

    // Small delay to let the video element mount
    const timer = setTimeout(() => {
      if (!videoRef.current) return
      setScanStatus('Point camera at a barcode...')
      // Request HD resolution so barcodes are sharp enough to decode
      codeReader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        videoRef.current,
        async (result, err) => {
          // err is thrown every frame when no barcode is visible — that's normal
          if (result && !hasScannedRef.current) {
            hasScannedRef.current = true
            const barcode = result.getText()
            setScanStatus(`Barcode detected: ${barcode}`)
            codeReader.reset()
            await lookupBarcode(barcode)
          }
        }
      ).catch(err => {
        console.error('Scanner error:', err)
        setScanError(`Camera error: ${err.message}. Try refreshing and allowing camera access.`)
        setScanStatus('')
      })
    }, 800)

    return () => {
      clearTimeout(timer)
      codeReader.reset()
    }
  }, [showScanner, scannedProduct])

  function stopScanner() {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
    }
    setShowScanner(false)
    setScannedProduct(null)
    setScanError('')
    hasScannedRef.current = false
  }

  async function lookupBarcode(barcode) {
    setScanStatus('Looking up product...')
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await res.json()

      if (data.status !== 1 || !data.product) {
        setScanError(`Product not found for barcode ${barcode}. You can add it manually.`)
        setScanIngredientName(barcode)
        setScannedProduct({ barcode, product_name: barcode, notFound: true })
        setScanQuantity('1')
        setScanUnit('')
        return
      }

      const product = data.product
      const productName = product.product_name || barcode
      const nutriments = product.nutriments || {}

      // Try to match to existing ingredient
      const { data: matches } = await supabase
        .from('ingredients')
        .select('id, name, category')
        .ilike('name', `%${productName.split(' ')[0]}%`)
        .limit(1)

      const matched = matches && matches.length > 0 ? matches[0] : null

      setScannedProduct({
        barcode,
        product_name: productName,
        nutriments,
        category: product.categories_tags?.[0] || 'pantry',
        matched,
      })
      setScanIngredientName(matched ? matched.name : productName)
      setScanQuantity('1')
      setScanUnit('')
      setScanStatus('Product found!')
    } catch (err) {
      console.error('Barcode lookup error:', err)
      setScanError('Failed to look up barcode. Check your connection.')
    }
  }

  async function handleScanSave() {
    if (!scannedProduct || !scanQuantity) return
    setScanSaving(true)
    try {
      let ingredientId = scannedProduct.matched?.id

      if (!ingredientId) {
        // Create a new ingredient
        const nutriments = scannedProduct.nutriments || {}
        const kcal = nutriments['energy-kcal_100g'] ?? (nutriments.energy_100g ? nutriments.energy_100g / 4.184 : null)
        const newIng = {
          name: scanIngredientName,
          category: 'pantry',
          storage_location: 'pantry',
          shelf_life_type: 'pantry_months',
          shelf_life_value: 12,
          purchase_frequency: 'monthly',
          store_section: 'other',
          calories_per_100g: kcal ?? null,
          protein_per_100g: nutriments.proteins_100g ?? null,
          carbs_per_100g: nutriments.carbohydrates_100g ?? null,
          fat_per_100g: nutriments.fat_100g ?? null,
          fiber_per_100g: nutriments.fiber_100g ?? null,
        }
        const { data: ingData, error: ingErr } = await supabase
          .from('ingredients')
          .insert(newIng)
          .select('id')
          .single()
        if (ingErr) throw ingErr
        ingredientId = ingData.id
      }

      const { error } = await supabase
        .from('inventory')
        .upsert(
          { ingredient_id: ingredientId, quantity: parseFloat(scanQuantity), unit: scanUnit },
          { onConflict: 'ingredient_id' }
        )
      if (error) throw error

      stopScanner()
      await loadData()
    } catch (err) {
      console.error('Error saving scanned item:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setScanSaving(false)
    }
  }

  // ─── Grouping ──────────────────────────────────────────────────────────────

  const grouped = inventory.reduce((acc, item) => {
    const cat = item.ingredient?.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const stockedCount = inventory.filter(i => i.quantity > 0).length
  const depletedCount = inventory.filter(i => i.quantity <= 0).length

  function stockDot(qty) {
    if (qty <= 0) return { dot: '🔴', label: 'depleted' }
    if (qty < 2) return { dot: '🟡', label: 'low' }
    return { dot: '🟢', label: 'stocked' }
  }

  if (loading) {
    return (
      <div className="inventory-page">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Loading inventory...</div>
      </div>
    )
  }

  return (
    <div className="inventory-page">
      <style>{`
        .inventory-page {
          padding: 1rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .inv-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .inv-title {
          font-family: 'Space Mono', monospace;
          font-size: 1.75rem;
          color: var(--primary, #2d5016);
          margin: 0;
        }

        .inv-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .btn-add, .btn-scan {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn-add {
          background: var(--primary, #2d5016);
          color: white;
        }

        .btn-add:hover { opacity: 0.85; }

        .btn-scan {
          background: var(--accent, #ff6b35);
          color: white;
        }

        .btn-scan:hover { opacity: 0.85; }

        .inv-summary {
          color: #666;
          font-size: 0.9rem;
          margin-bottom: 1.25rem;
        }

        /* Add form */
        .add-form {
          background: white;
          border: 2px solid var(--primary, #2d5016);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.25rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: flex-end;
        }

        .add-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
          min-width: 140px;
        }

        .add-form-group label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #444;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .add-form-group input,
        .add-form-group select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .add-form-group select {
          max-height: 200px;
        }

        .add-form-btns {
          display: flex;
          gap: 0.5rem;
        }

        .btn-save {
          padding: 0.5rem 1rem;
          background: var(--primary, #2d5016);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }

        .btn-cancel {
          padding: 0.5rem 1rem;
          background: #eee;
          color: #444;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        /* Category groups */
        .inv-category {
          margin-bottom: 1.5rem;
        }

        .cat-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #999;
          margin-bottom: 0.5rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #eee;
        }

        .inv-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          background: white;
          border-radius: 8px;
          margin-bottom: 0.4rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
        }

        .stock-dot {
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        .inv-name {
          flex: 1;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .inv-cat-badge {
          font-size: 0.7rem;
          background: #f0f0f0;
          color: #666;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }

        .inv-qty-input {
          width: 70px;
          padding: 0.25rem 0.4rem;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 0.85rem;
          text-align: right;
        }

        .inv-unit {
          font-size: 0.8rem;
          color: #666;
          min-width: 30px;
        }

        .btn-remove {
          background: none;
          border: none;
          color: #bbb;
          cursor: pointer;
          font-size: 1.1rem;
          padding: 0 0.25rem;
          transition: color 0.2s;
          line-height: 1;
        }

        .btn-remove:hover { color: #e53e3e; }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #999;
        }

        /* Scanner modal — fullscreen so barcode fills the frame */
        .scanner-overlay {
          position: fixed;
          inset: 0;
          background: #000;
          display: flex;
          flex-direction: column;
          z-index: 1000;
        }

        .scanner-modal {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          gap: 0;
        }

        .scanner-topbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
        }

        .scanner-title {
          font-family: 'Space Mono', monospace;
          font-size: 1.1rem;
          color: white;
          margin: 0;
        }

        .scanner-video-wrap {
          position: relative;
          flex: 1;
          background: #000;
          overflow: hidden;
        }

        .scanner-video-wrap video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .scanner-crosshair {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 70%;
          height: 25%;
          border: 2px solid rgba(255, 107, 53, 0.9);
          border-radius: 8px;
          pointer-events: none;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.4);
        }

        .scanner-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 10;
          padding: 1rem;
          background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
        }

        .scan-status {
          font-size: 0.85rem;
          color: #555;
          text-align: center;
        }

        .scan-error {
          font-size: 0.85rem;
          color: #e53e3e;
          background: #fff5f5;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
        }

        /* Scanned product confirm card */
        .scan-confirm {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .scan-confirm-title {
          font-weight: 700;
          font-size: 1rem;
        }

        .scan-confirm p {
          font-size: 0.8rem;
          color: #666;
          margin: 0;
        }

        .scan-confirm input {
          padding: 0.45rem 0.6rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
          width: 100%;
          box-sizing: border-box;
        }

        .scan-confirm-row {
          display: flex;
          gap: 0.5rem;
        }

        .scan-confirm-row input {
          flex: 1;
        }

        .scan-confirm-btns {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .btn-close {
          padding: 0.5rem 1rem;
          background: #eee;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
        }
      `}</style>

      {/* Header */}
      <div className="inv-header">
        <h1 className="inv-title">Pantry Inventory</h1>
        <div className="inv-actions">
          <button className="btn-add" onClick={() => { setShowAddForm(v => !v); setShowScanner(false) }}>
            + Add Item
          </button>
          <button className="btn-scan" onClick={startScanner}>
            Scan Barcode
          </button>
        </div>
      </div>

      <p className="inv-summary">
        {stockedCount} item{stockedCount !== 1 ? 's' : ''} stocked
        {depletedCount > 0 ? ` · ${depletedCount} depleted` : ''}
      </p>

      {/* Manual add form */}
      {showAddForm && (
        <div className="add-form">
          <div className="add-form-group" style={{ minWidth: '200px' }}>
            <label>Search ingredient</label>
            <input
              type="text"
              placeholder="Type to search..."
              value={addSearch}
              onChange={e => { setAddSearch(e.target.value); setAddIngredientId('') }}
            />
            {addSearch && filteredIngredients.length > 0 && (
              <select
                size={Math.min(filteredIngredients.length, 6)}
                value={addIngredientId}
                onChange={e => { setAddIngredientId(e.target.value); setAddSearch(ingredients.find(i => i.id === e.target.value)?.name || '') }}
                style={{ marginTop: '0.25rem' }}
              >
                {filteredIngredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
            )}
            {addSearch && filteredIngredients.length === 0 && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--accent, #ff6b35)' }}>
                No match — will create "{addSearch.trim()}" as a new ingredient
              </p>
            )}
          </div>
          <div className="add-form-group" style={{ maxWidth: '90px' }}>
            <label>Quantity</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={addQuantity}
              onChange={e => setAddQuantity(e.target.value)}
            />
          </div>
          <div className="add-form-group" style={{ maxWidth: '90px' }}>
            <label>Unit</label>
            <input
              type="text"
              placeholder="g, ml, pcs..."
              value={addUnit}
              onChange={e => setAddUnit(e.target.value)}
            />
          </div>
          <div className="add-form-btns">
            <button className="btn-save" onClick={handleManualSave} disabled={saving || !addSearch.trim() || !addQuantity}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-cancel" onClick={() => { setShowAddForm(false); setAddSearch(''); setAddIngredientId(''); setAddQuantity(''); setAddUnit('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inventory list */}
      {inventory.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem' }}>📦</div>
          <p>No items in inventory yet.</p>
          <p style={{ fontSize: '0.85rem' }}>Add items manually or scan a barcode to get started.</p>
        </div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
          <div key={cat} className="inv-category">
            <div className="cat-label">{cat}</div>
            {items.map(item => {
              const { dot } = stockDot(item.quantity)
              return (
                <div key={item.id} className="inv-item">
                  <span className="stock-dot">{dot}</span>
                  <span className="inv-name">{item.ingredient?.name || '—'}</span>
                  <span className="inv-cat-badge">{item.ingredient?.category}</span>
                  <input
                    className="inv-qty-input"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={item.quantity}
                    onBlur={e => handleQuantityEdit(item.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                  />
                  <span className="inv-unit">{item.unit}</span>
                  <button className="btn-remove" title="Remove" onClick={() => handleDelete(item.ingredient_id)}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        ))
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <div className="scanner-overlay">
          <div className="scanner-modal">
            {!scannedProduct ? (
              <>
                <div className="scanner-topbar">
                  <h2 className="scanner-title">Scan Barcode</h2>
                  <button className="btn-close" onClick={stopScanner} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✕ Close</button>
                </div>
                <div className="scanner-video-wrap">
                  <video ref={videoRef} autoPlay playsInline muted />
                  <div className="scanner-crosshair" />
                </div>
                <div className="scanner-bottom">
                  <p className="scan-status" style={{ color: 'white', textAlign: 'center', margin: 0, fontSize: '0.9rem' }}>{scanStatus}</p>
                  {scanError && <p className="scan-error" style={{ color: '#ff6b6b', textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{scanError}</p>}
                </div>
              </>
            ) : (
              <div className="scan-confirm" style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '1.25rem', marginTop: 'auto', maxHeight: '80vh', overflowY: 'auto' }}>
                <div className="scan-confirm-title">
                  {scannedProduct.notFound ? 'Product not found' : 'Product found!'}
                </div>
                {!scannedProduct.notFound && (
                  <p>Original name: <strong>{scannedProduct.product_name}</strong>
                    {scannedProduct.matched && <span style={{ color: 'green' }}> · matched existing ingredient</span>}
                  </p>
                )}
                {scannedProduct.notFound && <p className="scan-error">{scanError}</p>}

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#444' }}>
                    Ingredient name
                  </label>
                  <input
                    type="text"
                    value={scanIngredientName}
                    onChange={e => setScanIngredientName(e.target.value)}
                    style={{ marginTop: '0.25rem' }}
                    disabled={!!scannedProduct.matched}
                  />
                </div>

                <div className="scan-confirm-row">
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#444' }}>Qty</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={scanQuantity}
                      onChange={e => setScanQuantity(e.target.value)}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#444' }}>Unit</label>
                    <input
                      type="text"
                      placeholder="g, ml, cans..."
                      value={scanUnit}
                      onChange={e => setScanUnit(e.target.value)}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </div>
                </div>

                <div className="scan-confirm-btns">
                  <button className="btn-cancel" onClick={stopScanner}>Cancel</button>
                  <button
                    className="btn-save"
                    onClick={handleScanSave}
                    disabled={scanSaving || !scanIngredientName || !scanQuantity}
                    style={{ padding: '0.5rem 1rem', background: 'var(--primary, #2d5016)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {scanSaving ? 'Saving...' : 'Add to Inventory'}
                  </button>
                </div>

                <button
                  style={{ background: 'none', border: 'none', color: 'var(--accent, #ff6b35)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'center' }}
                  onClick={() => {
                    setScannedProduct(null)
                    setScanError('')
                    setScanStatus('Point camera at a barcode...')
                    hasScannedRef.current = false
                  }}
                >
                  Scan another barcode
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Inventory
