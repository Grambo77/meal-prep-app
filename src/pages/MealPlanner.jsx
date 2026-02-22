import React, { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, addDays, addWeeks, isSameDay } from 'date-fns'
import { supabase } from '../supabaseClient'

// Drag and Drop Meal Planner
// - 2 week view (current + next week)
// - Mon-Thu are cooking days
// - Drag recipes from sidebar to calendar
// - 2-week no-repeat rule highlighted

function MealPlanner() {
  const [recipes, setRecipes] = useState([])
  const [mealPlan, setMealPlan] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedRecipe, setDraggedRecipe] = useState(null)
  const [recentlyUsed, setRecentlyUsed] = useState([])
  
  // Start from this Sunday
  const weekOneStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const weekTwoStart = addWeeks(weekOneStart, 1)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      // Load all recipes
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('*')
        .order('name')
      
      if (recipeError) throw recipeError
      setRecipes(recipeData || [])

      // Load meal plan for 2 weeks
      const startDate = format(weekOneStart, 'yyyy-MM-dd')
      const endDate = format(addDays(weekTwoStart, 6), 'yyyy-MM-dd')
      
      const { data: planData, error: planError } = await supabase
        .from('meal_plan')
        .select(`*, recipe:recipes(*)`)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
      
      if (planError) throw planError
      setMealPlan(planData || [])

      // Calculate recently used recipes (last 2 weeks)
      const twoWeeksAgo = format(addWeeks(weekOneStart, -2), 'yyyy-MM-dd')
      const { data: recentData } = await supabase
        .from('meal_plan')
        .select('recipe_id')
        .gte('date', twoWeeksAgo)
        .lt('date', startDate)
      
      setRecentlyUsed((recentData || []).map(m => m.recipe_id))
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get meal for a specific date
  function getMealForDate(date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return mealPlan.find(m => m.date === dateStr)
  }

  // Check if recipe was used in last 2 weeks
  function isRecentlyUsed(recipeId) {
    // Check in recentlyUsed array (previous 2 weeks)
    if (recentlyUsed.includes(recipeId)) return true
    // Also check current plan
    return mealPlan.some(m => m.recipe_id === recipeId)
  }

  // Assign a recipe to a date (used by both drag-drop and tap-to-select)
  async function assignMeal(date, recipe) {
    if (!recipe) return
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayName = format(date, 'EEEE')
    try {
      const existingMeal = getMealForDate(date)
      if (existingMeal) {
        const { error } = await supabase
          .from('meal_plan')
          .update({ recipe_id: recipe.id, day_of_week: dayName })
          .eq('id', existingMeal.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('meal_plan')
          .insert({ date: dateStr, day_of_week: dayName, recipe_id: recipe.id })
        if (error) throw error
      }
      await loadData()
    } catch (error) {
      console.error('Error saving meal:', error)
      alert('Failed to save meal. Please try again.')
    }
    setDraggedRecipe(null)
  }

  // Drag handlers (desktop)
  function handleDragStart(e, recipe) {
    setDraggedRecipe(recipe)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', recipe.id)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e, date) {
    e.preventDefault()
    assignMeal(date, draggedRecipe)
  }

  // Tap-to-select handler (mobile)
  function handleRecipeTap(recipe) {
    setDraggedRecipe(prev => prev?.id === recipe.id ? null : recipe)
  }

  function handleDayTap(date) {
    if (draggedRecipe) assignMeal(date, draggedRecipe)
  }

  async function removeMeal(mealId) {
    try {
      const { error } = await supabase
        .from('meal_plan')
        .delete()
        .eq('id', mealId)
      
      if (error) throw error
      await loadData()
    } catch (error) {
      console.error('Error removing meal:', error)
    }
  }

  function renderWeek(weekStart, weekLabel) {
    const days = []
    
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i)
      const dayName = format(date, 'EEEE')
      const isToday = isSameDay(date, new Date())
      const isCookingDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'].includes(dayName)
      const meal = getMealForDate(date)

      const isDropTarget = isCookingDay && !!draggedRecipe

      days.push(
        <div
          key={i}
          className={`planner-day ${isCookingDay ? 'cooking-day' : 'off-day'} ${isToday ? 'today' : ''} ${isDropTarget ? 'drop-target' : ''}`}
          onDragOver={isCookingDay ? handleDragOver : undefined}
          onDrop={isCookingDay ? (e) => handleDrop(e, date) : undefined}
          onClick={isCookingDay ? () => handleDayTap(date) : undefined}
        >
          <div className="day-header">
            <span className="day-name">{dayName.slice(0, 3)}</span>
            <span className="day-date">{format(date, 'M/d')}</span>
          </div>

          <div className="day-content">
            {meal && meal.recipe ? (
              <div className="planned-meal">
                <span className="meal-emoji">{getRecipeEmoji(meal.recipe.name)}</span>
                <span className="meal-name">{meal.recipe.name}</span>
                <button
                  className="remove-meal"
                  onClick={(e) => { e.stopPropagation(); removeMeal(meal.id) }}
                  title="Remove meal"
                >
                  ×
                </button>
              </div>
            ) : isCookingDay ? (
              <div className="drop-zone">
                <span>{draggedRecipe ? 'Tap to assign' : 'Drop recipe here'}</span>
              </div>
            ) : dayName === 'Sunday' ? (
              <div className="special-day">
                <span>🍗</span>
                <span>Prep Day</span>
              </div>
            ) : dayName === 'Friday' ? (
              <div className="special-day">
                <span>🍕</span>
                <span>Easy Night</span>
              </div>
            ) : (
              <div className="special-day">
                <span>🔥</span>
                <span>Cook Fresh</span>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="week-container">
        <h3 className="week-label">{weekLabel}</h3>
        <div className="week-grid">{days}</div>
      </div>
    )
  }

  function getRecipeEmoji(name) {
    const lower = name.toLowerCase()
    if (lower.includes('chicken')) return '🍗'
    if (lower.includes('taco') || lower.includes('fajita') || lower.includes('burrito')) return '🌮'
    if (lower.includes('pasta') || lower.includes('sausage pasta')) return '🍝'
    if (lower.includes('pork')) return '🥩'
    if (lower.includes('salmon') || lower.includes('fish')) return '🐟'
    if (lower.includes('veggie') || lower.includes('vegetarian')) return '🥬'
    if (lower.includes('bbq') || lower.includes('pulled')) return '🍖'
    if (lower.includes('quinoa')) return '🥗'
    if (lower.includes('rice')) return '🍚'
    if (lower.includes('stir')) return '🥡'
    return '🍽️'
  }

  if (loading) {
    return (
      <div className="meal-planner">
        <div className="loading-state">Loading meal planner...</div>
      </div>
    )
  }

  return (
    <div className="meal-planner">
      <style>{`
        .meal-planner {
          padding: 1rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .planner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .planner-title {
          font-family: 'Space Mono', monospace;
          font-size: 1.75rem;
          color: var(--primary, #2d5016);
          margin: 0;
        }

        .planner-subtitle {
          color: var(--text-muted, #666);
          font-size: 0.9rem;
        }

        .planner-layout {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 1.5rem;
        }

        @media (max-width: 900px) {
          .planner-layout {
            grid-template-columns: 1fr;
          }
          .recipe-sidebar {
            order: -1;
          }
        }

        /* Calendar Grid */
        .calendar-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .week-container {
          background: white;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        .week-label {
          font-family: 'Space Mono', monospace;
          font-size: 1rem;
          color: var(--primary, #2d5016);
          margin: 0 0 0.75rem 0;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid var(--border, #e0e0e0);
        }

        .week-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.5rem;
        }

        @media (max-width: 700px) {
          .week-grid {
            grid-template-columns: repeat(4, 1fr);
          }
          .planner-day.off-day {
            display: none;
          }
        }

        .planner-day {
          border: 2px solid var(--border, #e0e0e0);
          border-radius: 8px;
          min-height: 100px;
          display: flex;
          flex-direction: column;
          transition: all 0.2s ease;
        }

        .planner-day.cooking-day {
          border-color: var(--primary, #2d5016);
          background: linear-gradient(to bottom, rgba(45, 80, 22, 0.03), white);
        }

        .planner-day.cooking-day:hover {
          border-color: var(--accent, #ff6b35);
          box-shadow: 0 4px 12px rgba(255, 107, 53, 0.15);
        }

        .planner-day.off-day {
          background: #f8f8f8;
          border-style: dashed;
        }

        .planner-day.today {
          box-shadow: 0 0 0 3px var(--accent, #ff6b35);
        }

        .day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          background: rgba(45, 80, 22, 0.05);
          border-radius: 6px 6px 0 0;
        }

        .day-name {
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .day-date {
          font-size: 0.75rem;
          color: var(--text-muted, #666);
        }

        .day-content {
          flex: 1;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .drop-zone {
          width: 100%;
          height: 100%;
          min-height: 60px;
          border: 2px dashed #ccc;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-size: 0.75rem;
          text-align: center;
          transition: all 0.2s ease;
        }

        .cooking-day:hover .drop-zone {
          border-color: var(--accent, #ff6b35);
          background: rgba(255, 107, 53, 0.05);
          color: var(--accent, #ff6b35);
        }

        .planned-meal {
          width: 100%;
          background: var(--primary, #2d5016);
          color: white;
          padding: 0.5rem;
          border-radius: 6px;
          text-align: center;
          position: relative;
          cursor: grab;
        }

        .meal-emoji {
          display: block;
          font-size: 1.5rem;
          margin-bottom: 0.25rem;
        }

        .meal-name {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          line-height: 1.2;
        }

        .remove-meal {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 18px;
          height: 18px;
          border: none;
          background: rgba(255,255,255,0.2);
          color: white;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .planned-meal:hover .remove-meal {
          opacity: 1;
        }

        .remove-meal:hover {
          background: rgba(255,0,0,0.5);
        }

        .special-day {
          text-align: center;
          color: var(--text-muted, #666);
          font-size: 0.75rem;
        }

        .special-day span:first-child {
          display: block;
          font-size: 1.25rem;
          margin-bottom: 0.25rem;
        }

        /* Recipe Sidebar */
        .recipe-sidebar {
          background: white;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          height: fit-content;
          position: sticky;
          top: 80px;
        }

        .sidebar-title {
          font-family: 'Space Mono', monospace;
          font-size: 1rem;
          color: var(--primary, #2d5016);
          margin: 0 0 0.5rem 0;
        }

        .sidebar-hint {
          font-size: 0.8rem;
          color: var(--text-muted, #666);
          margin-bottom: 1rem;
        }

        .recipe-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 500px;
          overflow-y: auto;
        }

        .recipe-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #f9f9f9;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: grab;
          transition: all 0.2s ease;
        }

        .recipe-card:hover {
          background: white;
          border-color: var(--primary, #2d5016);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .recipe-card:active {
          cursor: grabbing;
          transform: scale(1.02);
        }

        .recipe-card.recently-used {
          opacity: 0.5;
          border-style: dashed;
        }

        .recipe-card.recently-used::after {
          content: '⏱️';
          position: absolute;
          right: 8px;
          font-size: 0.8rem;
        }

        .recipe-card {
          position: relative;
        }

        .recipe-emoji-sidebar {
          font-size: 1.5rem;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 8px;
        }

        .recipe-info {
          flex: 1;
          min-width: 0;
        }

        .recipe-name {
          font-weight: 600;
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .recipe-meta {
          font-size: 0.7rem;
          color: var(--text-muted, #666);
        }

        .loading-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-muted, #666);
        }

        .legend {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.8rem;
          color: var(--text-muted, #666);
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border, #e0e0e0);
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }

        .legend-dot.cooking { background: var(--primary, #2d5016); }
        .legend-dot.special { background: #f8f8f8; border: 1px dashed #ccc; }
        .legend-dot.today { box-shadow: 0 0 0 2px var(--accent, #ff6b35); }

        /* Tap-to-select states */
        .recipe-card.selected {
          border-color: var(--accent, #ff6b35) !important;
          background: white;
          box-shadow: 0 2px 8px rgba(255, 107, 53, 0.25);
        }

        .planner-day.drop-target.cooking-day {
          border-color: var(--accent, #ff6b35);
          background: rgba(255, 107, 53, 0.05);
          cursor: pointer;
        }

        .planner-day.drop-target .drop-zone {
          border-color: var(--accent, #ff6b35);
          color: var(--accent, #ff6b35);
        }

        /* Always show remove button on touch devices */
        @media (hover: none) {
          .remove-meal {
            opacity: 1 !important;
          }
        }
      `}</style>

      <div className="planner-header">
        <div>
          <h1 className="planner-title">📅 Meal Planner</h1>
          <p className="planner-subtitle">Tap or drag recipes to Mon–Thu cooking days</p>
        </div>
      </div>

      <div className="planner-layout">
        <div className="calendar-section">
          {renderWeek(weekOneStart, `This Week · ${format(weekOneStart, 'MMM d')} - ${format(addDays(weekOneStart, 6), 'MMM d')}`)}
          {renderWeek(weekTwoStart, `Next Week · ${format(weekTwoStart, 'MMM d')} - ${format(addDays(weekTwoStart, 6), 'MMM d')}`)}
          
          <div className="legend">
            <div className="legend-item">
              <div className="legend-dot cooking"></div>
              <span>Cooking Day</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot special"></div>
              <span>Special Day</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot today"></div>
              <span>Today</span>
            </div>
            <div className="legend-item">
              <span>⏱️ Used in last 2 weeks</span>
            </div>
          </div>
        </div>

        <div className="recipe-sidebar">
          <h3 className="sidebar-title">Your Recipes</h3>
          <p className="sidebar-hint">
            {draggedRecipe
              ? `"${draggedRecipe.name}" selected — tap a day to assign`
              : 'Tap or drag a recipe to assign it'}
          </p>
          
          <div className="recipe-list">
            {recipes.map(recipe => {
              const isSelected = draggedRecipe?.id === recipe.id
              return (
                <div
                  key={recipe.id}
                  className={`recipe-card ${isRecentlyUsed(recipe.id) ? 'recently-used' : ''} ${isSelected ? 'selected' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, recipe)}
                  onDragEnd={() => setDraggedRecipe(null)}
                  onClick={() => handleRecipeTap(recipe)}
                >
                  <div className="recipe-emoji-sidebar">
                    {getRecipeEmoji(recipe.name)}
                  </div>
                  <div className="recipe-info">
                    <div className="recipe-name">{recipe.name}</div>
                    <div className="recipe-meta">
                      {recipe.prep_time_minutes && `${recipe.prep_time_minutes} min prep`}
                      {recipe.cook_time_minutes && ` · ${recipe.cook_time_minutes} min cook`}
                    </div>
                  </div>
                  {isSelected && <span style={{ fontSize: '0.7rem', color: 'var(--accent, #ff6b35)', fontWeight: 700 }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MealPlanner

