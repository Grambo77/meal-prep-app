import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function Recipes() {
  const [recipes, setRecipes] = useState([])
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [recipeIngredients, setRecipeIngredients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecipes()
  }, [])

  async function loadRecipes() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('name')

      if (error) throw error
      setRecipes(data || [])
    } catch (error) {
      console.error('Error loading recipes:', error)
    } finally {
      setLoading(false)
    }
  }

  async function viewRecipe(recipe) {
    setSelectedRecipe(recipe)

    // Load ingredients for this recipe
    try {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select(`
          *,
          ingredient:ingredients(name, category)
        `)
        .eq('recipe_id', recipe.id)

      if (error) throw error
      setRecipeIngredients(data || [])
    } catch (error) {
      console.error('Error loading recipe ingredients:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading recipes...</div>
  }

  return (
    <div className="recipes">
      <h1 style={{ marginBottom: '2rem', fontFamily: 'Space Mono, monospace' }}>
        📖 Recipes
      </h1>

      {!selectedRecipe ? (
        // Recipe List View
        <div className="grid grid-2">
          {recipes.map(recipe => (
            <div key={recipe.id} className="card" style={{ cursor: 'pointer' }} onClick={() => viewRecipe(recipe)}>
              <h3 style={{ marginBottom: '0.5rem' }}>{recipe.name}</h3>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {recipe.cuisine_type && (
                  <span className="badge info">{recipe.cuisine_type}</span>
                )}
                <span className="badge" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                  {recipe.prep_time_minutes + recipe.cook_time_minutes} min
                </span>
                <span className="badge success">{recipe.difficulty}</span>
              </div>

              {recipe.description && (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  {recipe.description}
                </p>
              )}

              <button className="btn" onClick={(e) => { e.stopPropagation(); viewRecipe(recipe); }}>
                View Recipe →
              </button>
            </div>
          ))}
        </div>
      ) : (
        // Recipe Detail View
        <div>
          <button 
            onClick={() => setSelectedRecipe(null)} 
            className="btn secondary"
            style={{ marginBottom: '1.5rem' }}
          >
            ← Back to Recipes
          </button>

          <div className="card">
            <h2 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>
              {selectedRecipe.name}
            </h2>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {selectedRecipe.cuisine_type && (
                <span className="badge info">{selectedRecipe.cuisine_type}</span>
              )}
              <span className="badge">
                Prep: {selectedRecipe.prep_time_minutes} min
              </span>
              <span className="badge">
                Cook: {selectedRecipe.cook_time_minutes} min
              </span>
              <span className="badge success">
                Serves: {selectedRecipe.servings}
              </span>
            </div>

            {selectedRecipe.description && (
              <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
                {selectedRecipe.description}
              </p>
            )}

            <div className="grid grid-2">
              {/* Ingredients */}
              <div>
                <h3 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>
                  📝 Ingredients
                </h3>
                {recipeIngredients.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading ingredients...</p>
                ) : (
                  <ul style={{ lineHeight: '2' }}>
                    {recipeIngredients.map(ri => (
                      <li key={ri.id}>
                        {ri.quantity} {ri.unit} {ri.ingredient.name}
                        {ri.notes && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}> ({ri.notes})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Instructions */}
              <div>
                <h3 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>
                  👨‍🍳 Instructions
                </h3>
                <div style={{ whiteSpace: 'pre-line', lineHeight: '1.8' }}>
                  {selectedRecipe.instructions}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Recipes
