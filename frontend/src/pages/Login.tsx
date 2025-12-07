import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin } from '../api';

export default function Login() {
  const [userCode, setUserCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await apiLogin(userCode);
      login(user);

      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/worker');
      }
    } catch {
      setError('Nie znaleziono użytkownika. Sprawdź kod.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Rejestr Produkcji</h1>
        <p className="login-subtitle">Wprowadź swój kod, aby kontynuować</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userCode">Kod użytkownika</label>
            <input
              type="text"
              id="userCode"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              placeholder="Wpisz kod logowania"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>

        <div className="login-help">
          <p>Kody pracowników możesz sprawdzić u administratora.</p>
        </div>
      </div>
    </div>
  );
}
