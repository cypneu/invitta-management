import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCostConfig, updateCostConfig, getProductTypes } from '../api';

const FINISH_LABELS: Record<string, string> = {
  U3: 'U3',
  U4: 'U4',
  O1: 'O1',
  O3: 'O3',
  O5: 'O5',
  OGK: 'OGK',
  LA: 'LA',
};

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const [finishTypes, setFinishTypes] = useState<string[]>([]);
  const [cornerFactors, setCornerFactors] = useState<Record<string, number>>({});
  const [sewingFactors, setSewingFactors] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [types, config] = await Promise.all([
        getProductTypes(),
        getCostConfig()
      ]);
      setFinishTypes(types);
      setCornerFactors(config.corner_sewing_factors);
      setSewingFactors(config.sewing_factors);
    } catch (err) {
      setError('Nie udało się załadować konfiguracji');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateCostConfig({
        corner_sewing_factors: cornerFactors,
        sewing_factors: sewingFactors
      });
      setSuccess('Konfiguracja zapisana pomyślnie');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas zapisywania');
    } finally {
      setSaving(false);
    }
  };

  const updateCornerFactor = (type: string, value: string) => {
    setCornerFactors(prev => ({ ...prev, [type]: parseFloat(value) || 0 }));
  };

  const updateSewingFactor = (type: string, value: string) => {
    setSewingFactors(prev => ({ ...prev, [type]: parseFloat(value) || 0 }));
  };

  return (
    <div className="admin-container">
      <header className="header">
        <h1>Ustawienia</h1>
        <nav className="nav">
          <Link to="/admin" className="nav-link">Podsumowanie</Link>
          <Link to="/admin/history" className="nav-link">Historia</Link>
          <Link to="/admin/add" className="nav-link">Dodaj wpis</Link>
          <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
          <Link to="/admin/settings" className="nav-link active">Ustawienia</Link>
        </nav>
        <div className="user-info">
          <span>{user?.name}</span>
          <button onClick={logout} className="btn-secondary">Wyloguj</button>
        </div>
      </header>

      <main className="admin-main">
        <div className="settings-card">
          <h3>Współczynniki kosztów szycia</h3>
          <p className="settings-description">
            Koszt produkcji = 4 × współczynnik narożnika + 2 × (szerokość + wysokość) × 0.01 × współczynnik szycia
          </p>

          {loading ? (
            <p className="loading">Ładowanie...</p>
          ) : (
            <>
              <div className="settings-table-wrapper">
                <table className="data-table settings-table">
                  <thead>
                    <tr>
                      <th>Rodzaj wykończenia</th>
                      <th>Wsp. narożnika</th>
                      <th>Wsp. szycia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishTypes.map(type => (
                      <tr key={type}>
                        <td>{FINISH_LABELS[type] || type}</td>
                        <td>
                          <input
                            type="number"
                            step="0.0001"
                            value={cornerFactors[type] ?? 0}
                            onChange={(e) => updateCornerFactor(type, e.target.value)}
                            className="factor-input"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.0001"
                            value={sewingFactors[type] ?? 0}
                            onChange={(e) => updateSewingFactor(type, e.target.value)}
                            className="factor-input"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
