import React from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import WeekView from './pages/WeekView'
import MealPlanner from './pages/MealPlanner'
import ShoppingLists from './pages/ShoppingLists'
import Recipes from './pages/Recipes'
import Nutrition from './pages/Nutrition'
import './App.css'
function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="main-nav">
          <div className="nav-container">
            <h1 className="logo">🍳 Meal Prep</h1>
            <div className="nav-links">
              <Link to="/">Dashboard</Link>
              <Link to="/nutrition">Nutrition</Link>
              <Link to="/week">This Week</Link>
              <Link to="/planner">Plan Meals</Link>
              <Link to="/shopping">Shopping</Link>
              <Link to="/recipes">Recipes</Link>
            </div>
          </div>
        </nav>
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/week" element={<WeekView />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/planner" element={<MealPlanner />} />
            <Route path="/shopping" element={<ShoppingLists />} />
            <Route path="/recipes" element={<Recipes />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
