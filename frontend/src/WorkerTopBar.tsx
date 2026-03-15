import { NavLink } from 'react-router-dom';

interface WorkerTopBarProps {
  activeOrdersCount: number;
  userName?: string;
  onLogout: () => void;
}

export default function WorkerTopBar({
  activeOrdersCount,
  userName,
  onLogout,
}: WorkerTopBarProps) {
  const nameParts = (userName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? userName ?? '';
  const lastName = nameParts.slice(1).join(' ');

  return (
    <div className="admin-topbar worker-topbar">
      <div className="admin-topbar-content">
        <nav className="admin-topbar-nav" aria-label="Nawigacja pracownika">
          <NavLink
            to="/worker"
            end
            className={({ isActive }) =>
              `nav-link nav-link-with-count${isActive ? ' active' : ''}`
            }
          >
            <span>Zamówienia</span>
            <span className="nav-link-count">{activeOrdersCount}</span>
          </NavLink>
          <NavLink
            to="/worker/entries"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Moje wpisy
          </NavLink>
        </nav>
        <div className="header-user worker-topbar-user">
          <span className="worker-topbar-name" title={userName}>
            <span>{firstName}</span>
            {lastName && <span>{lastName}</span>}
          </span>
          <button onClick={onLogout} className="btn-secondary btn-sm">Wyloguj</button>
        </div>
      </div>
    </div>
  );
}
