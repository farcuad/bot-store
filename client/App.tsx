import { Routes, Route } from 'react-router-dom';
import WhaibotLanding from './views/LandingPage';
import LoginView from './views/LoginView';
import SaasDashboard from './views/SaasDashboard';
import BotAdmin from './views/BotAdmin';
import UserManagement from './views/UserManagement';
import AdminBots from './views/AdminBots';
import SubscriptionView from './views/SubscriptionView';
import AdminSubscriptions from './views/AdminSubscriptions';
import RequestReceived from './views/RequestReceived';
import Layout from './components/Layout';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<WhaibotLanding />} />
      <Route path="/login" element={<LoginView />} />
      <Route path="/request-received" element={<RequestReceived />} />
      
      {/* Rutas con Layout (Navbar superior, etc) para usuarios logueados */}
      <Route element={<Layout />}>
        <Route path="/saas" element={<SaasDashboard />} />
        <Route path="/saas/subscription" element={<SubscriptionView />} />
        {/* Admin: gestión de todos los bots */}
        <Route path="/saas/admin" element={<AdminBots />} />
        <Route path="/saas/admin/subscriptions" element={<AdminSubscriptions />} />
        {/* Admin: gestión de usuarios */}
        <Route path="/saas/users" element={<UserManagement />} />
        <Route path="/bot/:botId" element={<BotAdmin />} />
      </Route>
    </Routes>
  );
}

export default App;

