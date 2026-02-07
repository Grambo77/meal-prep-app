import React, { useState, useEffect } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'

const SUPABASE_URL = 'https://yxfbhtapdtyxkxgfymvo.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZmJodGFwZHR5eGt4Z2Z5bXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTA3NDgsImV4cCI6MjA4NjA2Njc0OH0.Ijsv8ZorbAiQe0aWpLleB4k_teaqNwqHj97l8vNPOvo'

function Nutrition() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [dailyNutrition, setDailyNutrition] = useState([])
  const [weeklyTotals, setWeeklyTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNutritionData()
  }, [weekStart])

  async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      ...options,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })
    
    if (!response.ok) {
      throw new Error('API request failed')
    }
    
    return response.json()
  }

  async function loadNutritionData() {
    try {
      const weekEnd = addDays(weekStart, 6)

      const mealPlan = await apiRequest(
        `meal_plan?date=gte.${format(weekStart, 'yyyy-MM-dd')}&date=lte.${format(weekEnd, 'yyyy-MM-dd')}&order=date.asc&select=*`
      )

      const recipeIds = mealPlan.filter(m => m.recipe_id).map(m => m.recipe_id)

      if (recipeIds.length === 0) {
        setDailyNutrition([])
        setWeeklyTotals(null)
        setLoading(false)
        return
      }

      const recipes = await apiRequest(`recipes?id=in.(${recipeIds.join(',')})&select=*`)
      const recipeIngredients = await apiRequest(`recipe_ingredients?recipe_id=in.(${recipeIds.join(',')})&select=*`)
      const ingredientIds = [...new Set(recipeIngredients.map(ri => ri.ingredient_id))]
      const ingredients = await apiRequest(`ingredients?id=in.(${ingredientIds.join(',')})&select=*`)

      const ingredientMap = {}
      ingredients.forEach(ing => { ingredientMap[ing.id] = ing })

      const recipeNutritionMap = {}
      recipeIds.forEach(recipeId => {
        const recipe = recipes.find(r => r.id === recipeId)
        const recipeIngs = recipeIngredients.filter(ri => ri.recipe_id === recipeId)

        let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0

        recipeIngs.forEach(ri => {
          const ing = ingredientMap[ri.ingredient_id]
          if (ing) {
            const multiplier = ri.quantity / 100
            totalCalories += (ing.calories_per_100g || 0) * multiplier
            totalProtein += (ing.protein_per_100g || 0) * multiplier
            totalCarbs += (ing.carbs_per_100g || 0) * multiplier
            totalFat += (ing.fat_per_100g || 0) * multiplier
            totalFiber += (ing.fiber_per_100g || 0) * multiplier
          }
        })

        const servings = recipe?.servings || 3
        recipeNutritionMap[recipeId] = {
          calories: Math.round(totalCalories / servings),
          protein: Math.round(totalProtein / servings),
          carbs: Math.round(totalCarbs / servings),
          fat: Math.round(totalFat / servings),
          fiber: Math.round(totalFiber / servings)
        }
      })

      const daily = []
      let weekCalories = 0, weekProtein = 0, weekCarbs = 0, weekFat = 0, weekFiber = 0, daysWithMeals = 0

      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i)
        const dayName = format(date, 'EEEE')
        const meal = mealPlan.find(m => m.date === format(date, 'yyyy-MM-dd'))

        if (meal?.recipe_id && recipeNutritionMap[meal.recipe_id]) {
          const nutrition = recipeNutritionMap[meal.recipe_id]
          daily.push({ date, dayName, ...nutrition, hasData: true })
          weekCalories += nutrition.calories
          weekProtein += nutrition.protein
          weekCarbs += nutrition.carbs
          weekFat += nutrition.fat
          weekFiber += nutrition.fiber
          daysWithMeals++
        } else {
          daily.push({ date, dayName, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, hasData: false })
        }
      }

      setDailyNutrition(daily)
      setWeeklyTotals({
        total: { calories: weekCalories, protein: weekProtein, carbs: weekCarbs, fat: weekFat, fiber: weekFiber },
        average: {
          calories: daysWithMeals > 0 ? Math.round(weekCalories / daysWithMeals) : 0,
          protein: daysWithMeals > 0 ? Math.round(weekProtein / daysWithMeals) : 0,
          carbs: daysWithMeals > 0 ? Math.round(weekCarbs / daysWithMeals) : 0,
          fat: daysWithMeals > 0 ? Math.round(weekFat / daysWithMeals) : 0,
          fiber: daysWithMeals > 0 ? Math.round(weekFiber / daysWithMeals) : 0
        },
        daysWithMeals
      })
    } catch (error) {
      console.error('Error loading nutrition data:', error)
    } finally {
      setLoading(false)
    }
  }

  function NutritionBar({ label, value, max, color, unit = 'g' }) {
    const percentage = Math.min((value / max) * 100, 100)
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span>{value}{unit} / {max}{unit}</span>
        </div>
        <div style={{ background: 'var(--border)', height: '24px', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ background: color, height: '100%', width: `${percentage}%`, transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>
            {percentage > 20 && `${Math.round(percentage)}%`}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading nutrition data...</div>

  return (
    <div className="nutrition">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'Space Mono, monospace' }}>📊 Nutrition Tracker</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn secondary">← Previous</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn secondary">Next →</button>
        </div>
      </div>

      <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
        Week of {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
      </p>

      {weeklyTotals && weeklyTotals.daysWithMeals > 0 ? (
        <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>📈 Daily Average ({weeklyTotals.daysWithMeals} meals)</h2>
            <NutritionBar label="Calories" value={weeklyTotals.average.calories} max={2500} color="linear-gradient(90deg, #ff6b35, #e85a2a)" unit=" kcal" />
            <NutritionBar label="Protein" value={weeklyTotals.average.protein} max={150} color="linear-gradient(90deg, #4a7c2c, #2d5016)" />
            <NutritionBar label="Carbs" value={weeklyTotals.average.carbs} max={300} color="linear-gradient(90deg, #ffd93d, #f6c244)" />
            <NutritionBar label="Fat" value={weeklyTotals.average.fat} max={80} color="linear-gradient(90deg, #6bcf7f, #51b86e)" />
            <NutritionBar label="Fiber" value={weeklyTotals.average.fiber} max={30} color="linear-gradient(90deg, #8b5cf6, #7c3aed)" />
          </div>

          <div className="card">
            <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>🎯 Weekly Totals</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{weeklyTotals.total.calories.toLocaleString()}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>kcal</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{weeklyTotals.total.protein}g</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Protein</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffd93d' }}>{weeklyTotals.total.carbs}g</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Carbs</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6bcf7f' }}>{weeklyTotals.total.fat}g</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Fat</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="empty-state">
            <h3>No meals planned this week</h3>
            <p>Add meals to your weekly plan to see nutrition data</p>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>📅 Daily Breakdown</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Day</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Calories</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Protein</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Carbs</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Fat</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Fiber</th>
              </tr>
            </thead>
            <tbody>
              {dailyNutrition.map((day, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--border)', opacity: day.hasData ? 1 : 0.5 }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                    {day.dayName}
                    {format(day.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && (
                      <span className="badge success" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>Today</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.hasData ? `${day.calories} kcal` : '—'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.hasData ? `${day.protein}g` : '—'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.hasData ? `${day.carbs}g` : '—'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.hasData ? `${day.fat}g` : '—'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.hasData ? `${day.fiber}g` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem', background: 'var(--bg)' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          💡 <strong>Note:</strong> Nutrition is calculated per serving based on recipe ingredients. Values are estimates.
        </p>
      </div>
    </div>
  )
}

export default Nutrition

