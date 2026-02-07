import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { format, startOfWeek, addDays } from 'date-fns'

function Dashboard() {
  const [thisWeekMeals, setThisWeekMeals] = useState([])
  const [shoppingStatus, setShoppingStatus] = useState({
    monthly: false,
    weekly: false
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      // Get this week's date range (Sunday to Saturday)
      const now = new Date()
      const weekStart = startOfWeek(now, { weekStartsOn: 0 }) // 0 = Sunday
      const weekEnd = addDays(weekStart, 6)

      // Fetch this week's meal plan
      const { data: mealPlan, error: mealError } = await supabase
        .from('meal_plan')
        .select(`
          *,
          recipe:recipes(name, cuisine_type)
        `)
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        .order('date')

      if (mealError) throw mealError
      setThisWeekMeals(mealPlan || [])

      // Check shopping list status
      const { data: lists, error: listError } = await supabase
        .from('shopping_lists')
        .select('list_type, status')
        .eq('status', 'completed')

      if (listError) throw listError

      setShoppingStatus({
        monthly: lists?.some(l => l.list_type === 'monthly_staples') || false,
        weekly: lists?.some(l => l.list_type === 'weekly_fresh') || false
      })

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  return (
    <div className="dashboard">
      <h1 style={{ marginBottom: '2rem', fontFamily: 'Space Mono, monospace' }}>
        📅 Meal Prep Dashboard
      </h1>

      <div className="grid grid-2">
        {/* This Week Overview */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📅 This Week</h2>
            <Link to="/week" className="btn secondary">View Full Week →</Link>
          </div>
          
          {thisWeekMeals.length === 0 ? (
            <div className="empty-state">
              <p>No meals planned yet</p>
              <Link to="/planner" className="btn" style={{ marginTop: '1rem' }}>
                Plan This Week
              </Link>
            </div>
          ) : (
            <div>
              {thisWeekMeals.slice(0, 4).map(meal => (
                <div key={meal.id} className="list-item">
                  <strong>{meal.day_of_week}:</strong>
                  <span>{meal.recipe?.name || meal.notes || 'Not planned'}</span>
                  {meal.recipe?.cuisine_type && (
                    <span className="badge info">{meal.recipe.cuisine_type}</span>
                  )}
                </div>
              ))}
              {thisWeekMeals.length > 4 && (
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
                  + {thisWeekMeals.length - 4} more days
                </p>
              )}
            </div>
          )}
        </div>

        {/* Shopping Status */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🛒 Shopping Status</h2>
            <Link to="/shopping" className="btn secondary">Go to Lists →</Link>
          </div>
          
          <div>
            <div className="list-item">
              <span>Monthly Staples:</span>
              <span className={`badge ${shoppingStatus.monthly ? 'success' : 'warning'}`}>
                {shoppingStatus.monthly ? '✓ Stocked' : '⏳ Pending'}
              </span>
            </div>
            <div className="list-item">
              <span>This Week Fresh:</span>
              <span className={`badge ${shoppingStatus.weekly ? 'success' : 'warning'}`}>
                {shoppingStatus.weekly ? '✓ Bought' : '⏳ Needed'}
              </span>
            </div>
            <div className="list-item">
              <span>Next Fresh Shop:</span>
              <span style={{ color: 'var(--text-muted)' }}>In 4 days</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">⚡ Quick Actions</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Link to="/planner" className="btn">
              📝 Plan Next Week
            </Link>
            <Link to="/shopping" className="btn secondary">
              🛒 View Shopping Lists
            </Link>
            <Link to="/recipes" className="btn secondary">
              📖 Browse Recipes
            </Link>
          </div>
        </div>

        {/* Nutrition Overview (Placeholder) */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📊 Nutrition (This Week)</h2>
          </div>
          
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <p>Nutrition tracking coming soon!</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Will show weekly calories, protein, carbs, and fat
            </p>
          </div>
        </div>
      </div>

      {/* Next Prep Day */}
      <div className="card" style={{ marginTop: '1.5rem', background: 'linear-gradient(135deg, var(--accent) 0%, #e85a2a 100%)', color: 'white' }}>
        <h3 style={{ marginBottom: '0.5rem', fontFamily: 'Space Mono, monospace' }}>
          🍗 Next Prep Day: Sunday
        </h3>
        <p style={{ opacity: 0.9 }}>
          2.5 hours of meal prep = 4 nights of 15-minute dinners + family time from 7:15-9:00 PM
        </p>
        <button className="btn" style={{ marginTop: '1rem', background: 'white', color: 'var(--accent)' }}>
          View Prep Guide →
        </button>
      </div>
    </div>
  )
}

export default Dashboard
