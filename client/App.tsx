import { Routes, Route } from 'react-router-dom';
import WhaibotLanding from './views/LandingPage';
import LoginView from './views/LoginView';
import SaasDashboard from './views/SaasDashboard';
import BotAdmin from './views/BotAdmin';
import UserManagement from './views/UserManagement';
import AdminBots from './views/AdminBots';
import Layout from './components/Layout';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<WhaibotLanding />} />
      <Route path="/login" element={<LoginView />} />
      
      {/* Rutas con Layout (Navbar superior, etc) para usuarios logueados */}
      <Route element={<Layout />}>
        <Route path="/saas" element={<SaasDashboard />} />
        {/* Admin: gestión de todos los bots */}
        <Route path="/saas/admin" element={<AdminBots />} />
        {/* Admin: gestión de usuarios */}
        <Route path="/saas/users" element={<UserManagement />} />
        <Route path="/bot/:botId" element={<BotAdmin />} />
      </Route>
    </Routes>
  );
}

export default App;

