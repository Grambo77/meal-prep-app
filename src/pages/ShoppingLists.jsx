import React, { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { supabase } from '../supabaseClient'

const SECTION_ORDER = [
  'meat', 'seafood', 'produce', 'dairy', 'frozen',
  'grains', 'pasta', 'canned', 'condiments', 'oils',
  'asian', 'mexican', 'bakery', 'spices', 'other'
]

const SECTION_LABELS = {
  meat:       '🥩 Meat',
  seafood:    '🐟 Seafood',
  produce:    '🥦 Produce',
  dairy:      '🧀 Dairy',
  frozen:     '🧊 Frozen',
  grains:     '🌾 Grains & Rice',
  pasta:      '🍝 Pasta & Sauce',
  canned:     '🥫 Canned Goods',
  condiments: '🫙 Condiments',
  oils:       '🫒 Oils',
  asian:      '🥢 Asian',
  mexican:    '🌮 Mexican',
  bakery:     '🍞 Bakery',
  spices:     '🧂 Spices',
  other:      '📦 Other',
}

function weekKey() {
  return format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
}

function monthKey() {
  return format(new Date(), 'yyyy-MM')
}

function loadChecked(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} }
}

function saveChecked(storageKey, checked) {
  localStorage.setItem(storageKey, JSON.stringify(checked))
}

// Build grouped ingredient list from meal plan entries + their recipe_ingredients
async function buildIngredientList(planRows, frequencyFilter = null) {
  if (!planRows || planRows.length === 0) return {}

  const recipeIds = [...new Set(planRows.map(p => p.recipe_id).filter(Boolean))]
  if (recipeIds.length === 0) return {}

  const { data: riRows, error } = await supabase
    .from('recipe_ingredients')
    .select('*, ingredient:ingredients(name, store_section, purchase_frequency)')
    .in('recipe_id', recipeIds)

  if (error) throw error

  // Map recipe_id -> recipe name
  const recipeNames = {}
  planRows.forEach(p => { if (p.recipe_id) recipeNames[p.recipe_id] = p.recipe?.name })

  // Deduplicate ingredients, track which recipes use them
  const ingMap = {}
  for (const ri of riRows) {
    if (!ri.ingredient) continue
    const { name, store_section, purchase_frequency } = ri.ingredient
    if (frequencyFilter && !frequencyFilter.includes(purchase_frequency)) continue

    const key = name.toLowerCase()
    if (!ingMap[key]) {
      ingMap[key] = {
        name,
        quantity: ri.quantity,
        unit: ri.unit,
        section: store_section || 'other',
        recipes: [],
        notes: ri.notes,
      }
    }
    const recipeName = recipeNames[ri.recipe_id]
    if (recipeName && !ingMap[key].recipes.includes(recipeName)) {
      ingMap[key].recipes.push(recipeName)
    }
  }

  // Group by section
  const grouped = {}
  for (const item of Object.values(ingMap)) {
    const sec = item.section
    if (!grouped[sec]) grouped[sec] = []
    grouped[sec].push(item)
  }

  // Sort within each section
  for (const sec of Object.keys(grouped)) {
    grouped[sec].sort((a, b) => a.name.localeCompare(b.name))
  }

  return grouped
}

// ---- Ingredient List UI (shared by weekly + monthly) ----
function IngredientList({ grouped, checkedKey, mealSummary }) {
  const [checked, setChecked] = useState(() => loadChecked(checkedKey))

  useEffect(() => {
    setChecked(loadChecked(checkedKey))
  }, [checkedKey])

  function toggle(name) {
    setChecked(prev => {
      const next = { ...prev, [name]: !prev[name] }
      saveChecked(checkedKey, next)
      return next
    })
  }

  function clearChecked() {
    saveChecked(checkedKey, {})
    setChecked({})
  }

  const sections = SECTION_ORDER.filter(s => grouped[s]?.length > 0)
  const totalItems = Object.values(grouped).flat().length
  const checkedCount = Object.values(checked).filter(Boolean).length

  if (sections.length === 0) return null

  return (
    <div>
      {mealSummary && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Generated from:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {mealSummary.map(m => (
              <span key={m} className="badge info" style={{ fontSize: '0.75rem' }}>{m}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {checkedCount} of {totalItems} items checked
        </span>
        {checkedCount > 0 && (
          <button
            onClick={clearChecked}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear all checks
          </button>
        )}
      </div>

      {sections.map(sec => (
        <div key={sec} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {SECTION_LABELS[sec] || sec}
          </h3>
          {grouped[sec].map(item => {
            const isChecked = !!checked[item.name]
            return (
              <div
                key={item.name}
                className="list-item"
                style={{ opacity: isChecked ? 0.45 : 1, cursor: 'pointer' }}
                onClick={() => toggle(item.name)}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.name)}
                  onClick={e => e.stopPropagation()}
                />
                <span style={{ flex: 1, textDecoration: isChecked ? 'line-through' : 'none' }}>
                  <strong>{item.name}</strong>
                  {item.quantity && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {' '}— {item.quantity} {item.unit}
                    </span>
                  )}
                </span>
                {item.recipes.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {item.recipes.join(', ')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---- Main Component ----
function ShoppingLists() {
  const [activeTab, setActiveTab] = useState('misc')

  // Misc state
  const [miscItems, setMiscItems] = useState([])
  const [miscListId, setMiscListId] = useState(null)
  const [newItemText, setNewItemText] = useState('')
  const [miscLoading, setMiscLoading] = useState(true)

  // Weekly state
  const [weeklyGrouped, setWeeklyGrouped] = useState({})
  const [weeklyMeals, setWeeklyMeals] = useState([])
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyLoaded, setWeeklyLoaded] = useState(false)

  // Monthly state
  const [monthlyGrouped, setMonthlyGrouped] = useState({})
  const [monthlyMeals, setMonthlyMeals] = useState([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthlyLoaded, setMonthlyLoaded] = useState(false)

  // ---- Misc ----
  const loadMisc = useCallback(async () => {
    try {
      let { data: lists } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('list_type', 'misc_items')
        .eq('status', 'active')
        .limit(1)

      let listId = lists?.[0]?.id
      if (!listId) {
        const { data: newList } = await supabase
          .from('shopping_lists')
          .insert({ list_type: 'misc_items', status: 'active' })
          .select('id')
          .single()
        listId = newList?.id
      }

      setMiscListId(listId)

      if (listId) {
        const { data: items } = await supabase
          .from('shopping_list_items')
          .select('*')
          .eq('shopping_list_id', listId)
          .order('created_at')
        setMiscItems(items || [])
      }
    } catch (err) {
      console.error('Error loading misc:', err)
    } finally {
      setMiscLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMisc()
    const interval = setInterval(loadMisc, 5000)
    return () => clearInterval(interval)
  }, [loadMisc])

  async function addMiscItem() {
    if (!newItemText.trim() || !miscListId) return
    await supabase.from('shopping_list_items').insert({
      shopping_list_id: miscListId,
      item_name: newItemText.trim(),
      checked: false,
    })
    setNewItemText('')
    loadMisc()
  }

  async function toggleMiscItem(id, checked) {
    await supabase.from('shopping_list_items').update({ checked: !checked }).eq('id', id)
    loadMisc()
  }

  async function deleteMiscItem(id) {
    await supabase.from('shopping_list_items').delete().eq('id', id)
    loadMisc()
  }

  // ---- Weekly ----
  async function loadWeekly() {
    setWeeklyLoading(true)
    try {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 })

      const { data: plans } = await supabase
        .from('meal_plan')
        .select('recipe_id, recipe:recipes(name)')
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        .not('recipe_id', 'is', null)

      const grouped = await buildIngredientList(plans)
      setWeeklyGrouped(grouped)
      setWeeklyMeals([...new Set((plans || []).map(p => p.recipe?.name).filter(Boolean))])
      setWeeklyLoaded(true)
    } catch (err) {
      console.error('Error loading weekly:', err)
    } finally {
      setWeeklyLoading(false)
    }
  }

  // ---- Monthly Staples ----
  async function loadMonthly() {
    setMonthlyLoading(true)
    try {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
      const twoWeekEnd = endOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 0 })

      const { data: plans } = await supabase
        .from('meal_plan')
        .select('recipe_id, recipe:recipes(name)')
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(twoWeekEnd, 'yyyy-MM-dd'))
        .not('recipe_id', 'is', null)

      const grouped = await buildIngredientList(plans, ['monthly', 'freezer_months'])
      setMonthlyGrouped(grouped)
      setMonthlyMeals([...new Set((plans || []).map(p => p.recipe?.name).filter(Boolean))])
      setMonthlyLoaded(true)
    } catch (err) {
      console.error('Error loading monthly:', err)
    } finally {
      setMonthlyLoading(false)
    }
  }

  // Auto-load when switching tabs
  useEffect(() => {
    if (activeTab === 'weekly' && !weeklyLoaded) loadWeekly()
    if (activeTab === 'monthly' && !monthlyLoaded) loadMonthly()
  }, [activeTab])

  const hasWeekly = Object.keys(weeklyGrouped).length > 0
  const hasMonthly = Object.keys(monthlyGrouped).length > 0

  return (
    <div className="shopping-lists">
      <h1 style={{ marginBottom: '2rem', fontFamily: 'Space Mono, monospace' }}>🛒 Shopping Lists</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {[
          { key: 'misc',    label: `📝 Misc (${miscItems.length})` },
          { key: 'weekly',  label: '🥬 This Week' },
          { key: 'monthly', label: '🗓️ Monthly Staples' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
              padding: '0.75rem 1rem',
              marginBottom: '-2px',
              fontWeight: activeTab === tab.key ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- MISC TAB ---- */}
      {activeTab === 'misc' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Misc Items</h2>
            <span className="badge info">Synced across devices</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addMiscItem()}
              placeholder="Add misc item..."
              style={{ flex: 1 }}
            />
            <button onClick={addMiscItem} className="btn">+ Add</button>
          </div>

          {miscLoading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : miscItems.length === 0 ? (
            <div className="empty-state">
              <p>No misc items yet</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Add items as they come up</p>
            </div>
          ) : (
            miscItems.map(item => (
              <div key={item.id} className="list-item" style={{ opacity: item.checked ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleMiscItem(item.id, item.checked)}
                />
                <span style={{ flex: 1, textDecoration: item.checked ? 'line-through' : 'none' }}>
                  {item.item_name}
                </span>
                <button
                  onClick={() => deleteMiscItem(item.id)}
                  style={{ background: 'var(--accent)', padding: '0.25rem 0.75rem', fontSize: '0.9rem' }}
                >
                  ✕
                </button>
              </div>
            ))
          )}

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: '6px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              💡 <strong>Tip:</strong> Misc items sync across all devices. Refreshes every 5 seconds.
            </p>
          </div>
        </div>
      )}

      {/* ---- WEEKLY TAB ---- */}
      {activeTab === 'weekly' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>This Week's Shopping</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Week of {format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'MMM d')}
              </p>
            </div>
            <button className="btn secondary" onClick={loadWeekly} disabled={weeklyLoading}>
              {weeklyLoading ? 'Loading...' : '↻ Refresh'}
            </button>
          </div>

          {weeklyLoading ? (
            <p style={{ color: 'var(--text-muted)' }}>Generating from your meal plan...</p>
          ) : !hasWeekly ? (
            <div className="empty-state">
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📅</p>
              <p><strong>No meals planned this week</strong></p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                Add meals to your planner first, then come back here.
              </p>
            </div>
          ) : (
            <IngredientList
              grouped={weeklyGrouped}
              checkedKey={`checked_weekly_${weekKey()}`}
              mealSummary={weeklyMeals}
            />
          )}
        </div>
      )}

      {/* ---- MONTHLY TAB ---- */}
      {activeTab === 'monthly' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>Monthly Staples</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Proteins, pantry &amp; frozen — bulk buy items from your 2-week plan
              </p>
            </div>
            <button className="btn secondary" onClick={loadMonthly} disabled={monthlyLoading}>
              {monthlyLoading ? 'Loading...' : '↻ Refresh'}
            </button>
          </div>

          {monthlyLoading ? (
            <p style={{ color: 'var(--text-muted)' }}>Generating from your meal plan...</p>
          ) : !hasMonthly ? (
            <div className="empty-state">
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🗓️</p>
              <p><strong>No meals planned for the next 2 weeks</strong></p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                Plan your meals first, then come back here for your staples list.
              </p>
            </div>
          ) : (
            <IngredientList
              grouped={monthlyGrouped}
              checkedKey={`checked_monthly_${monthKey()}`}
              mealSummary={monthlyMeals}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default ShoppingLists
