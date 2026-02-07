import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { format, startOfWeek, addDays } from 'date-fns'

function WeekView() {
  const [weekMeals, setWeekMeals] = useState([])
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [loading, setLoading] = useState(true)

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  useEffect(() => {
    loadWeekMeals()
  }, [weekStart])

  async function loadWeekMeals() {
    try {
      const weekEnd = addDays(weekStart, 6)

      const { data, error } = await supabase
        .from('meal_plan')
        .select(`
          *,
          recipe:recipes(*)
        `)
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        .order('date')

      if (error) throw error
      setWeekMeals(data || [])
    } catch (error) {
      console.error('Error loading week meals:', error)
    } finally {
      setLoading(false)
    }
  }

  function getMealForDay(dayName) {
    return weekMeals.find(m => m.day_of_week === dayName)
  }

  if (loading) {
    return <div className="loading">Loading this week...</div>
  }

  return (
    <div className="week-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'Space Mono, monospace' }}>
          📅 This Week ({format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d')})
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="btn secondary"
          >
            ← Previous
          </button>
          <button 
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="btn secondary"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid">
        {daysOfWeek.map((day, index) => {
          const meal = getMealForDay(day)
          const date = addDays(weekStart, index)
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

          return (
            <div 
              key={day} 
              className="card"
              style={{
                border: isToday ? '3px solid var(--primary)' : 'none'
              }}
            >
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontFamily: 'Space Mono, monospace', marginBottom: '0.25rem' }}>
                  {day}
                  {isToday && <span className="badge success" style={{ marginLeft: '0.5rem' }}>Today</span>}
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {format(date, 'MMM d')}
                </p>
              </div>

              {meal?.recipe ? (
                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>{meal.recipe.name}</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {meal.recipe.cuisine_type && (
                      <span className="badge info">{meal.recipe.cuisine_type}</span>
                    )}
                    <span className="badge" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                      {meal.recipe.prep_time_minutes + meal.recipe.cook_time_minutes} min
                    </span>
                  </div>
                  {meal.recipe.description && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      {meal.recipe.description}
                    </p>
                  )}
                </div>
              ) : meal?.notes ? (
                <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  {meal.notes}
                </p>
              ) : day === 'Sunday' ? (
                <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '6px' }}>
                  <p><strong>🍗 Prep Day</strong></p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    2.5 hours → 4 easy weeknight dinners
                  </p>
                </div>
              ) : day === 'Friday' ? (
                <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '6px' }}>
                  <p><strong>🍕 Easy Night</strong></p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Order in, frozen pizza, or leftovers
                  </p>
                </div>
              ) : day === 'Saturday' ? (
                <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '6px' }}>
                  <p><strong>👨‍🍳 Cook Fresh</strong></p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Grill out or try something new
                  </p>
                </div>
              ) : (
                <div className="empty-state">
                  <p>No meal planned</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WeekView
