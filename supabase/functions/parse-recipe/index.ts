import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Parse ISO 8601 duration e.g. "PT15M", "PT1H30M"
function parseDuration(iso: unknown): number {
  if (!iso || typeof iso !== 'string') return 0
  const hours = parseInt(iso.match(/(\d+)H/)?.[1] ?? '0')
  const minutes = parseInt(iso.match(/(\d+)M/)?.[1] ?? '0')
  return hours * 60 + minutes
}

// Extract first number from yield strings like "4 servings", "Makes 4", ["4"]
function parseServings(yield_: unknown): number | null {
  if (!yield_) return null
  const str = Array.isArray(yield_) ? String(yield_[0]) : String(yield_)
  const match = str.match(/\d+/)
  return match ? parseInt(match[0]) : null
}

// Handle instructions as string, string[], or HowToStep[]
function parseInstructions(instructions: unknown): string {
  if (!instructions) return ''
  if (typeof instructions === 'string') return instructions.replace(/<[^>]+>/g, '').trim()
  if (Array.isArray(instructions)) {
    return instructions
      .map((step: unknown) => {
        if (typeof step === 'string') return step.replace(/<[^>]+>/g, '').trim()
        if (step && typeof step === 'object') {
          const s = step as Record<string, unknown>
          return String(s.text || s.name || '').replace(/<[^>]+>/g, '').trim()
        }
        return String(step)
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

// Parse "2 cups flour, sifted" → { quantity, unit, name, notes }
const UNITS = new Set([
  'cup', 'cups', 'tablespoon', 'tablespoons', 'tbsp', 'tbs',
  'teaspoon', 'teaspoons', 'tsp', 'pound', 'pounds', 'lb', 'lbs',
  'ounce', 'ounces', 'oz', 'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'ml', 'milliliter', 'milliliters', 'liter', 'liters', 'l',
  'clove', 'cloves', 'can', 'cans', 'package', 'packages', 'pkg',
  'slice', 'slices', 'piece', 'pieces', 'bunch', 'bunches',
  'stalk', 'stalks', 'head', 'heads', 'pinch', 'dash', 'handful',
])

function parseIngredient(str: string): { name: string; quantity: string; unit: string; notes: string } {
  str = str.replace(/<[^>]+>/g, '').trim()
  const qMatch = str.match(/^([\d\s⅛¼⅓⅜½⅝⅔¾⅞\/\-\.]+)/)
  if (!qMatch) return { name: str, quantity: '', unit: '', notes: '' }

  const quantity = qMatch[1].trim()
  let remaining = str.slice(qMatch[0].length).trim()

  let unit = ''
  const words = remaining.split(/\s+/)
  if (words.length > 0) {
    const candidate = words[0].toLowerCase().replace(/[.,]$/, '')
    if (UNITS.has(candidate)) {
      unit = words[0].replace(/[.,]$/, '')
      remaining = words.slice(1).join(' ').trim()
    }
  }

  let name = remaining
  let notes = ''
  const splitIdx = remaining.search(/,|\(/)
  if (splitIdx > 0) {
    name = remaining.slice(0, splitIdx).trim()
    notes = remaining.slice(splitIdx + 1).replace(/[()]/g, '').trim()
  }

  return { name: name || str, quantity, unit, notes }
}

function isRecipe(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false
  const type = (obj as Record<string, unknown>)['@type']
  if (typeof type === 'string') return type === 'Recipe'
  if (Array.isArray(type)) return type.includes('Recipe')
  return false
}

function extractRecipeJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1])
      if (isRecipe(json)) return json
      if (Array.isArray(json)) {
        const found = json.find(isRecipe)
        if (found) return found
      }
      if (json?.['@graph'] && Array.isArray(json['@graph'])) {
        const found = json['@graph'].find(isRecipe)
        if (found) return found
      }
    } catch {
      // skip invalid JSON blocks
    }
  }
  return null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { url } = body
  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ error: 'URL is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Fetch the page
  let html: string
  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Could not fetch page (HTTP ${res.status}). The site may block automated access.` }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }
    html = await res.text()
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch recipe page', detail: String(err) }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Extract structured recipe data
  const data = extractRecipeJsonLd(html)
  if (!data) {
    return new Response(
      JSON.stringify({
        error: 'No structured recipe data found on this page. Try AllRecipes, Food Network, Serious Eats, or BBC Good Food.',
      }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Map schema.org Recipe → our format
  const cuisineRaw = data.recipeCuisine
  const cuisine = Array.isArray(cuisineRaw) ? String(cuisineRaw[0]) : String(cuisineRaw || '')

  const recipe = {
    name: String(data.name || ''),
    description: String(data.description || '').replace(/<[^>]+>/g, '').trim(),
    cuisine_type: cuisine,
    difficulty: 'Easy',
    prep_time_minutes: parseDuration(data.prepTime),
    cook_time_minutes: parseDuration(data.cookTime),
    servings: parseServings(data.recipeYield),
    instructions: parseInstructions(data.recipeInstructions),
    ingredients: (data.recipeIngredient as string[] || []).map(parseIngredient),
  }

  return new Response(JSON.stringify({ recipe }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
