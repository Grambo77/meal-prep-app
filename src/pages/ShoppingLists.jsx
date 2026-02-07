import React, { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://yxfbhtapdtyxkxgfymvo.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZmJodGFwZHR5eGt4Z2Z5bXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTA3NDgsImV4cCI6MjA4NjA2Njc0OH0.Ijsv8ZorbAiQe0aWpLleB4k_teaqNwqHj97l8vNPOvo'

function ShoppingLists() {
  const [activeTab, setActiveTab] = useState('misc')
  const [miscItems, setMiscItems] = useState([])
  const [weeklyItems, setWeeklyItems] = useState([])
  const [monthlyItems, setMonthlyItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadShoppingLists()
    
    // Poll for updates every 5 seconds
    const interval = setInterval(loadShoppingLists, 5000)
    return () => clearInterval(interval)
  }, [])

  async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      ...options,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...options.headers
      }
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('API Error:', error)
      throw new Error(error)
    }
    
    return response.json()
  }

  async function loadShoppingLists() {
    try {
      // Get misc shopping list
      let lists = await apiRequest('shopping_lists?list_type=eq.misc_items&status=eq.active&select=id')
      
      let miscList = lists[0]
      
      // Create if doesn't exist
      if (!miscList) {
        const newLists = await apiRequest('shopping_lists', {
          method: 'POST',
          body: JSON.stringify({ list_type: 'misc_items', status: 'active' })
        })
        miscList = newLists[0]
      }

      // Load items for this list
      if (miscList) {
        const items = await apiRequest(`shopping_list_items?shopping_list_id=eq.${miscList.id}&order=created_at.asc&select=*`)
        setMiscItems(items || [])
      }

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
      // Get or create list
      let lists = await apiRequest('shopping_lists?list_type=eq.misc_items&status=eq.active&select=id')
      let miscList = lists[0]

      if (!miscList) {
        const newLists = await apiRequest('shopping_lists', {
          method: 'POST',
          body: JSON.stringify({ list_type: 'misc_items', status: 'active' })
        })
        miscList = newLists[0]
      }

      // Add item
      await apiRequest('shopping_list_items', {
        method: 'POST',
        body: JSON.stringify({
          shopping_list_id: miscList.id,
          item_name: newItemText.trim(),
          checked: false
        })
      })

      setNewItemText('')
      loadShoppingLists()
    } catch (error) {
      console.error('Error adding item:', error)
    }
  }

  async function toggleMiscItem(itemId, currentChecked) {
    try {
      await apiRequest(`shopping_list_items?id=eq.${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ checked: !currentChecked })
      })

      loadShoppingLists()
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  async function deleteMiscItem(itemId) {
    try {
      await apiRequest(`shopping_list_items?id=eq.${itemId}`, {
        method: 'DELETE'
      })

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
              💡 <strong>Tip:</strong> Misc items sync across all devices. 
              Add items from any phone or computer! Refreshes every 5 seconds.
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
          </div>
        </div>
      )}
    </div>
  )
}

export default ShoppingLists
