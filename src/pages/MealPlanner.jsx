import React from 'react'

function MealPlanner() {
  return (
    <div className="meal-planner">
      <h1 style={{ marginBottom: '2rem', fontFamily: 'Space Mono, monospace' }}>
        📝 Meal Planner
      </h1>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Plan Your Meals</h2>
        </div>
        
        <div className="empty-state">
          <h3>Coming in Phase 1!</h3>
          <p style={{ marginTop: '1rem' }}>
            This will let you:
          </p>
          <ul style={{ textAlign: 'left', maxWidth: '400px', margin: '1rem auto', lineHeight: '2' }}>
            <li>View 2 weeks ahead</li>
            <li>Drag recipes to specific days</li>
            <li>See what you've planned Mon-Thu (cooked nights)</li>
            <li>Auto-generate shopping lists from your plan</li>
          </ul>
          <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)' }}>
            For now, we'll focus on getting the shopping list and recipes working first
          </p>
        </div>
      </div>
    </div>
  )
}

export default MealPlanner
