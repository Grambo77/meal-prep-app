# Meal Prep Tool

Family meal planning and grocery management system.

## Features

- **Dashboard**: Overview of this week's meals and shopping status
- **Week View**: See your full week of planned meals
- **Shopping Lists**: Three types - Monthly staples, Weekly fresh, and Misc items (with real-time sync)
- **Recipes**: Browse your recipe collection with full ingredients and instructions
- **Meal Planner**: Plan meals 2 weeks ahead (coming soon)

## Tech Stack

- React 18 with Vite
- Supabase (PostgreSQL + real-time subscriptions)
- React Router for navigation
- PWA support for mobile installation

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database is Already Configured

Your Supabase connection is already set up in `src/supabaseClient.js` with:
- 4 recipes (Chicken Stir-Fry, Tacos, Pasta Marinara, Chicken & Rice Bowl)
- 31 ingredients with nutrition data
- All necessary tables

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` folder ready to deploy.

## Deployment Options

### Option 1: Vercel (Recommended - Free)

1. Push this code to GitHub
2. Go to https://vercel.com
3. Import your GitHub repo
4. Vercel auto-detects Vite and deploys
5. Done! You get a URL like `meal-prep-app.vercel.app`

### Option 2: Netlify (Also Free)

1. Push to GitHub
2. Go to https://netlify.com
3. New site from Git
4. Build command: `npm run build`
5. Publish directory: `dist`

## Current Status

✅ **Working:**
- Dashboard with overview
- This Week view
- Shopping lists with misc items (real-time sync across devices)
- Recipe browser with full details
- Mobile-responsive design

🚧 **Coming in Phase 1:**
- Weekly fresh shopping list (auto-generated from meal plan)
- Monthly staples list (auto-generated from 4-week plan)
- Meal planner interface
- Nutrition tracking

## File Structure

```
meal-prep-app/
├── src/
│   ├── pages/           # Main page components
│   │   ├── Dashboard.jsx
│   │   ├── WeekView.jsx
│   │   ├── MealPlanner.jsx
│   │   ├── ShoppingLists.jsx
│   │   └── Recipes.jsx
│   ├── App.jsx          # Main app with routing
│   ├── App.css          # Global styles
│   ├── main.jsx         # Entry point
│   └── supabaseClient.js # Database connection
├── index.html
├── package.json
└── vite.config.js       # Build config + PWA
```

## Next Steps

1. Deploy to Vercel/Netlify
2. Test on your phone
3. Add your current misc items from the old HTML list
4. Start using it for this week's shopping

## Support

Built with Claude as a learning project to master React and database design.
