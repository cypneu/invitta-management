import { NavLink } from 'react-router-dom';

interface AdminTopBarProps {
  userName?: string;
  onLogout: () => void;
}

const adminNavItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Zamówienia' },
  { to: '/admin/products', label: 'Produkty' },
  { to: '/admin/workers', label: 'Pracownicy' },
  { to: '/admin/stats', label: 'Statystyki' },
] as const;

export default function AdminTopBar({ userName, onLogout }: AdminTopBarProps) {
  return (
    <div className="admin-topbar">
      <div className="admin-topbar-content">
        <nav className="admin-topbar-nav" aria-label="Nawigacja administratora">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-user">
          <span>{userName}</span>
          <button onClick={onLogout} className="btn-secondary btn-sm">Wyloguj</button>
        </div>
      </div>
    </div>
  );
}
