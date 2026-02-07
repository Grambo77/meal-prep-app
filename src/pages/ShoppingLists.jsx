import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function ShoppingLists() {
  const [activeTab, setActiveTab] = useState('misc') // Start with misc since it's what they have
  const [miscItems, setMiscItems] = useState([])
  const [weeklyItems, setWeeklyItems] = useState([])
  const [monthlyItems, setMonthlyItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadShoppingLists()
    
    // Set up real-time subscription for misc items
    const subscription = supabase
      .channel('shopping_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shopping_list_items'
      }, () => {
        loadShoppingLists()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadShoppingLists() {
    try {
      // Load misc items list
      let { data: miscList, error: listError } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('list_type', 'misc_items')
        .eq('status', 'active')
        .maybeSingle()

      if (listError && listError.code !== 'PGRST116') {
        console.error('Error loading shopping list:', listError)
      }

      // Create misc list if it doesn't exist
      if (!miscList) {
        const { data: newList, error: createError } = await supabase
          .from('shopping_lists')
          .insert({ list_type: 'misc_items', status: 'active' })
          .select()
          .single()
        
        if (createError) {
          console.error('Error creating shopping list:', createError)
          return
        }
        miscList = newList
      }

      // Load misc items
      if (miscList) {
        const { data: items, error: itemsError } = await supabase
          .from('shopping_list_items')
          .select('*')
          .eq('shopping_list_id', miscList.id)
          .order('created_at')

        if (itemsError) {
          console.error('Error loading items:', itemsError)
        } else {
          setMiscItems(items || [])
        }
      }

      // TODO: Load weekly and monthly lists
      setWeeklyItems([])
      setMonthlyItems([])

    } catch (error) {
      console.error('Error loading shopping lists:', error)
    } finally {
      setLoading(false)
    }
  }
  async function addMiscItem() {
    if (!newItemText.trim()) return

    try {
      // Get or create misc list
      let { data: miscList } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('list_type', 'misc_items')
        .eq('status', 'active')
        .single()

      if (!miscList) {
        const { data: newList } = await supabase
          .from('shopping_lists')
          .insert({ list_type: 'misc_items', status: 'active' })
          .select()
          .single()
        miscList = newList
      }

      // Add item
      await supabase
        .from('shopping_list_items')
        .insert({
          shopping_list_id: miscList.id,
          item_name: newItemText.trim(),
          checked: false
        })

      setNewItemText('')
      loadShoppingLists()
    } catch (error) {
      console.error('Error adding item:', error)
    }
  }

  async function toggleMiscItem(itemId, currentChecked) {
    try {
      await supabase
        .from('shopping_list_items')
        .update({ checked: !currentChecked })
        .eq('id', itemId)

      loadShoppingLists()
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  async function deleteMiscItem(itemId) {
    try {
      await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', itemId)

      loadShoppingLists()
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading shopping lists...</div>
  }

  return (
    <div className="shopping-lists">
      <h1 style={{ marginBottom: '2rem', fontFamily: 'Space Mono, monospace' }}>
        🛒 Shopping Lists
      </h1>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('misc')}
          style={{
            background: 'none',
            color: activeTab === 'misc' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'misc' ? '3px solid var(--primary)' : 'none',
            padding: '1rem',
            marginBottom: '-2px'
          }}
        >
          📝 Misc Items ({miscItems.length})
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          style={{
            background: 'none',
            color: activeTab === 'weekly' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'weekly' ? '3px solid var(--primary)' : 'none',
            padding: '1rem',
            marginBottom: '-2px'
          }}
        >
          🥬 Weekly Fresh (Coming Soon)
        </button>
        <button
          onClick={() => setActiveTab('monthly')}
          style={{
            background: 'none',
            color: activeTab === 'monthly' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'monthly' ? '3px solid var(--primary)' : 'none',
            padding: '1rem',
            marginBottom: '-2px'
          }}
        >
          🗓️ Monthly Staples (Coming Soon)
        </button>
      </div>

      {/* Misc Items Tab */}
      {activeTab === 'misc' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Misc Items</h2>
            <span className="badge info">Synced across devices</span>
          </div>

          {/* Add Item Input */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addMiscItem()}
              placeholder="Add misc item..."
              style={{ flex: 1 }}
            />
            <button onClick={addMiscItem} className="btn">
              + Add
            </button>
          </div>

          {/* Items List */}
          {miscItems.length === 0 ? (
            <div className="empty-state">
              <p>No misc items yet</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Add items as they come up (like tropical juice from Aldi's!)
              </p>
            </div>
          ) : (
            <div>
              {miscItems.map(item => (
                <div 
                  key={item.id} 
                  className="list-item"
                  style={{ opacity: item.checked ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleMiscItem(item.id, item.checked)}
                  />
                  <span style={{ 
                    flex: 1, 
                    textDecoration: item.checked ? 'line-through' : 'none'
                  }}>
                    {item.item_name}
                  </span>
                  <button
                    onClick={() => deleteMiscItem(item.id)}
                    style={{
                      background: 'var(--accent)',
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: '6px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              💡 <strong>Tip:</strong> Misc items sync across all devices in real-time. 
              Add items from any phone or computer!
            </p>
          </div>
        </div>
      )}

      {/* Weekly Fresh Tab */}
      {activeTab === 'weekly' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Weekly Fresh Produce</h2>
          </div>
          <div className="empty-state">
            <h3>Coming Soon!</h3>
            <p>This will auto-generate from your weekly meal plan</p>
            <p style={{ marginTop: '1rem' }}>
              Based on Mon-Thu meals, it will list: onions, peppers, broccoli, etc.
            </p>
          </div>
        </div>
      )}

      {/* Monthly Staples Tab */}
      {activeTab === 'monthly' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Monthly Staples</h2>
          </div>
          <div className="empty-state">
            <h3>Coming Soon!</h3>
            <p>This will generate from your 4-week meal plan</p>
            <p style={{ marginTop: '1rem' }}>
              Proteins to freeze, pantry items, and monthly stock-ups
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShoppingLists
