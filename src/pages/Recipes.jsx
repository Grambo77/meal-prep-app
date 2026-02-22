import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'


const EMPTY_FORM = {
  name: '',
  description: '',
  cuisine_type: '',
  difficulty: 'Easy',
  prep_time_minutes: '',
  cook_time_minutes: '',
  servings: '',
  instructions: '',
}

const EMPTY_INGREDIENT = { name: '', quantity: '', unit: '', notes: '' }

function Recipes() {
  const [recipes, setRecipes] = useState([])
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [recipeIngredients, setRecipeIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'detail' | 'add' | 'import'
  const [form, setForm] = useState(EMPTY_FORM)
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Import state
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importStep, setImportStep] = useState('url') // 'url' | 'review'

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
    setView('detail')

    try {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select(`*, ingredient:ingredients(name, category)`)
        .eq('recipe_id', recipe.id)

      if (error) throw error
      setRecipeIngredients(data || [])
    } catch (error) {
      console.error('Error loading recipe ingredients:', error)
    }
  }

  function goBack() {
    setSelectedRecipe(null)
    setView('list')
  }

  function openAddForm() {
    setForm(EMPTY_FORM)
    setIngredients([{ ...EMPTY_INGREDIENT }])
    setError('')
    setView('add')
  }

  function openImport() {
    setImportUrl('')
    setImportError('')
    setImportStep('url')
    setView('import')
  }

  async function extractRecipe() {
    const url = importUrl.trim()
    if (!url) {
      setImportError('Please enter a recipe URL.')
      return
    }
    try { new URL(url) } catch {
      setImportError('Please enter a valid URL (e.g. https://www.allrecipes.com/recipe/...).')
      return
    }

    setImporting(true)
    setImportError('')

    try {
      const { data, error: fnError } = await supabase.functions.invoke('parse-recipe', {
        body: { url },
      })

      if (fnError) throw new Error(fnError.message || 'Extraction failed')
      if (!data?.recipe) throw new Error(data?.error || 'No recipe data returned')

      const r = data.recipe
      setForm({
        name: r.name || '',
        description: r.description || '',
        cuisine_type: r.cuisine_type || '',
        difficulty: ['Easy', 'Medium', 'Hard'].includes(r.difficulty) ? r.difficulty : 'Easy',
        prep_time_minutes: r.prep_time_minutes != null ? String(r.prep_time_minutes) : '',
        cook_time_minutes: r.cook_time_minutes != null ? String(r.cook_time_minutes) : '',
        servings: r.servings != null ? String(r.servings) : '',
        instructions: r.instructions || '',
      })

      if (r.ingredients && r.ingredients.length > 0) {
        setIngredients(r.ingredients.map(ing => ({
          name: ing.name || '',
          quantity: ing.quantity || '',
          unit: ing.unit || '',
          notes: ing.notes || '',
        })))
      } else {
        setIngredients([{ ...EMPTY_INGREDIENT }])
      }

      setImportStep('review')
    } catch (err) {
      setImportError(err.message || 'Failed to extract recipe. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  async function deleteRecipe() {
    if (!window.confirm(`Delete "${selectedRecipe.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', selectedRecipe.id)
      if (error) throw error
      await loadRecipes()
      goBack()
    } catch (err) {
      console.error('Error deleting recipe:', err)
      alert('Failed to delete recipe. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function updateIngredient(index, field, value) {
    setIngredients(prev => prev.map((ing, i) => i === index ? { ...ing, [field]: value } : ing))
  }

  function addIngredientRow() {
    setIngredients(prev => [...prev, { ...EMPTY_INGREDIENT }])
  }

  function removeIngredientRow(index) {
    setIngredients(prev => prev.filter((_, i) => i !== index))
  }

  async function saveRecipe(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Recipe name is required.'); return }
    setSaving(true)
    setError('')

    try {
      // Insert recipe
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          name: form.name.trim(),
          description: form.description.trim() || null,
          cuisine_type: form.cuisine_type.trim() || null,
          difficulty: form.difficulty,
          prep_time_minutes: parseInt(form.prep_time_minutes) || 0,
          cook_time_minutes: parseInt(form.cook_time_minutes) || 0,
          servings: parseInt(form.servings) || null,
          instructions: form.instructions.trim() || null,
        })
        .select()
        .single()

      if (recipeError) throw recipeError

      // Handle ingredients — if anything fails, delete the recipe we just created
      const validIngredients = ingredients.filter(i => i.name.trim())
      try { for (const ing of validIngredients) {
        // Insert ingredient if it doesn't exist yet (preserve existing data on conflict)
        await supabase
          .from('ingredients')
          .upsert({
            name: ing.name.trim(),
            category: 'pantry',
            storage_location: 'pantry',
            shelf_life_type: 'pantry_months',
            shelf_life_value: 12,
            purchase_frequency: 'weekly',
            store_section: 'other',
          }, { onConflict: 'name', ignoreDuplicates: true })

        // Fetch the ingredient ID (whether just inserted or already existed)
        const { data: ingData, error: ingError } = await supabase
          .from('ingredients')
          .select('id')
          .eq('name', ing.name.trim())
          .single()

        if (ingError) throw ingError

        // Link to recipe
        const { error: riError } = await supabase
          .from('recipe_ingredients')
          .insert({
            recipe_id: recipeData.id,
            ingredient_id: ingData.id,
            quantity: ing.quantity.trim() || '',
            unit: ing.unit.trim() || '',
            notes: ing.notes.trim() || '',
          })

        if (riError) throw riError
      }
      } catch (ingErr) {
        // Roll back: delete the recipe we just inserted
        await supabase.from('recipes').delete().eq('id', recipeData.id)
        throw ingErr
      }

      await loadRecipes()
      setView('list')
    } catch (err) {
      console.error('Error saving recipe:', err)
      setError('Failed to save recipe. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading recipes...</div>
  }

  const sharedFormStyles = `
    .recipe-form { max-width: 800px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem; }
    .form-group label { font-weight: 600; font-size: 0.85rem; color: var(--text-muted, #666); }
    .form-group input, .form-group select, .form-group textarea {
      padding: 0.6rem 0.75rem;
      border: 2px solid var(--border, #e0e0e0);
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--primary, #2d5016);
    }
    .form-group textarea { resize: vertical; min-height: 120px; }
    .ingredient-row { display: grid; grid-template-columns: 2fr 1fr 1fr 2fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
    @media (max-width: 600px) { .ingredient-row { grid-template-columns: 1fr 1fr; } }
    .ingredient-row input { padding: 0.5rem; border: 2px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 0.85rem; font-family: inherit; }
    .ingredient-row input:focus { outline: none; border-color: var(--primary, #2d5016); }
    .remove-row { background: none; border: none; color: #cc0000; font-size: 1.2rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .remove-row:hover { background: #fff0f0; }
    .form-error { color: #cc0000; font-size: 0.9rem; margin-bottom: 1rem; }
    .ingredient-header { display: grid; grid-template-columns: 2fr 1fr 1fr 2fr auto; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--text-muted, #666); margin-bottom: 0.25rem; }
    .url-input-row { display: flex; gap: 0.75rem; align-items: center; }
    .url-input-row input { flex: 1; padding: 0.6rem 0.75rem; border: 2px solid var(--border, #e0e0e0); border-radius: 8px; font-size: 0.95rem; font-family: inherit; }
    .url-input-row input:focus { outline: none; border-color: var(--primary, #2d5016); }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.4); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .import-hint { font-size: 0.82rem; color: var(--text-muted, #666); margin-top: 0.6rem; line-height: 1.5; }
  `

  // --- Recipe Form (shared by add and import review) ---
  const RecipeFormFields = () => (
    <>
      <div className="form-group">
        <label>Recipe Name *</label>
        <input
          type="text"
          placeholder="e.g. Chicken Stir-Fry"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <input
          type="text"
          placeholder="Short description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Cuisine Type</label>
          <input
            type="text"
            placeholder="e.g. Asian, Mexican, Italian"
            value={form.cuisine_type}
            onChange={e => setForm(f => ({ ...f, cuisine_type: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Difficulty</label>
          <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Prep Time (minutes)</label>
          <input
            type="number"
            min="0"
            placeholder="15"
            value={form.prep_time_minutes}
            onChange={e => setForm(f => ({ ...f, prep_time_minutes: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Cook Time (minutes)</label>
          <input
            type="number"
            min="0"
            placeholder="30"
            value={form.cook_time_minutes}
            onChange={e => setForm(f => ({ ...f, cook_time_minutes: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-group" style={{ maxWidth: '200px' }}>
        <label>Servings</label>
        <input
          type="number"
          min="1"
          placeholder="4"
          value={form.servings}
          onChange={e => setForm(f => ({ ...f, servings: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <label>Instructions</label>
        <textarea
          placeholder="Step by step instructions..."
          value={form.instructions}
          onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
        />
      </div>

      <h3 style={{ fontFamily: 'Space Mono, monospace', marginBottom: '0.75rem' }}>Ingredients</h3>
      <div className="ingredient-header">
        <span>Ingredient</span>
        <span>Quantity</span>
        <span>Unit</span>
        <span>Notes</span>
        <span></span>
      </div>
      {ingredients.map((ing, i) => (
        <div key={i} className="ingredient-row">
          <input
            type="text"
            placeholder="e.g. Chicken breast"
            value={ing.name}
            onChange={e => updateIngredient(i, 'name', e.target.value)}
          />
          <input
            type="text"
            placeholder="e.g. 500"
            value={ing.quantity}
            onChange={e => updateIngredient(i, 'quantity', e.target.value)}
          />
          <input
            type="text"
            placeholder="g, ml, cups"
            value={ing.unit}
            onChange={e => updateIngredient(i, 'unit', e.target.value)}
          />
          <input
            type="text"
            placeholder="e.g. diced"
            value={ing.notes}
            onChange={e => updateIngredient(i, 'notes', e.target.value)}
          />
          <button
            type="button"
            className="remove-row"
            onClick={() => removeIngredientRow(i)}
            title="Remove"
          >×</button>
        </div>
      ))}

      <button
        type="button"
        className="btn secondary"
        style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}
        onClick={addIngredientRow}
      >
        + Add Ingredient
      </button>
    </>
  )

  // --- Add Recipe Form ---
  if (view === 'add') {
    return (
      <div className="recipes">
        <style>{sharedFormStyles}</style>

        <button onClick={goBack} className="btn secondary" style={{ marginBottom: '1.5rem' }}>
          ← Back to Recipes
        </button>

        <div className="card recipe-form">
          <h2 style={{ marginBottom: '1.5rem', fontFamily: 'Space Mono, monospace' }}>Add New Recipe</h2>

          {error && <p className="form-error">{error}</p>}

          <form onSubmit={saveRecipe}>
            <RecipeFormFields />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Recipe'}
              </button>
              <button type="button" className="btn secondary" onClick={goBack}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // --- Import from Web View ---
  if (view === 'import') {
    return (
      <div className="recipes">
        <style>{sharedFormStyles}</style>

        <button onClick={goBack} className="btn secondary" style={{ marginBottom: '1.5rem' }}>
          ← Back to Recipes
        </button>

        <div className="card recipe-form">
          <h2 style={{ marginBottom: '0.5rem', fontFamily: 'Space Mono, monospace' }}>
            Import Recipe from Web
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Paste the URL of any recipe page. Works with AllRecipes, Food Network, Serious Eats, BBC Good Food, and most major recipe sites.
          </p>

          {importStep === 'url' && (
            <>
              <div className="form-group">
                <label>Recipe URL</label>
                <div className="url-input-row">
                  <input
                    type="url"
                    placeholder="https://www.allrecipes.com/recipe/..."
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && extractRecipe()}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={extractRecipe}
                    disabled={importing || !importUrl.trim()}
                  >
                    {importing ? <><span className="spinner" />Importing...</> : 'Import'}
                  </button>
                </div>
                <p className="import-hint">
                  The recipe page is fetched server-side — no API key or account needed. Free.
                </p>
              </div>

              {importError && <p className="form-error">{importError}</p>}

              <button type="button" className="btn secondary" onClick={goBack}>
                Cancel
              </button>
            </>
          )}

          {importStep === 'review' && (
            <>
              <div style={{
                background: '#f0f7e8',
                border: '1px solid #c5e0a0',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#3a6b1a',
              }}>
                Recipe extracted! Review and edit the details below, then click Save.
                <button
                  type="button"
                  style={{ marginLeft: '1rem', background: 'none', border: 'none', color: '#3a6b1a', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem', padding: 0 }}
                  onClick={() => setImportStep('paste')}
                >
                  ← Back to paste
                </button>
              </div>

              {error && <p className="form-error">{error}</p>}

              <form onSubmit={saveRecipe}>
                <RecipeFormFields />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="submit" className="btn" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Recipe'}
                  </button>
                  <button type="button" className="btn secondary" onClick={goBack}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    )
  }

  // --- Recipe Detail View ---
  if (view === 'detail' && selectedRecipe) {
    return (
      <div className="recipes">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <button onClick={goBack} className="btn secondary">← Back to Recipes</button>
          <button
            onClick={deleteRecipe}
            disabled={deleting}
            className="btn secondary"
            style={{ color: '#cc0000', borderColor: '#cc0000' }}
          >
            {deleting ? 'Deleting...' : 'Delete Recipe'}
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>
            {selectedRecipe.name}
          </h2>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {selectedRecipe.cuisine_type && (
              <span className="badge info">{selectedRecipe.cuisine_type}</span>
            )}
            <span className="badge">Prep: {selectedRecipe.prep_time_minutes} min</span>
            <span className="badge">Cook: {selectedRecipe.cook_time_minutes} min</span>
            <span className="badge success">Serves: {selectedRecipe.servings}</span>
          </div>

          {selectedRecipe.description && (
            <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
              {selectedRecipe.description}
            </p>
          )}

          <div className="grid grid-2">
            <div>
              <h3 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>📝 Ingredients</h3>
              {recipeIngredients.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No ingredients listed.</p>
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

            <div>
              <h3 style={{ marginBottom: '1rem', fontFamily: 'Space Mono, monospace' }}>👨‍🍳 Instructions</h3>
              <div style={{ whiteSpace: 'pre-line', lineHeight: '1.8' }}>
                {selectedRecipe.instructions}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Recipe List View ---
  return (
    <div className="recipes">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'Space Mono, monospace', margin: 0 }}>📖 Recipes</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn secondary" onClick={openImport}>Import from Web</button>
          <button className="btn" onClick={openAddForm}>+ Add Recipe</button>
        </div>
      </div>

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

            <button className="btn" onClick={e => { e.stopPropagation(); viewRecipe(recipe) }}>
              View Recipe →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Recipes
