import { useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { clearToken } from "../../api/client";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  function isActive(path) {
    if (path === "/teacher" && location.pathname === "/teacher") return true;
    if (path !== "/teacher" && location.pathname.startsWith(path)) return true;
    return false;
  }

  function handleNavClick() {
    setMenuOpen(false);
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h1>ExamPilot</h1>
        </div>
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menü"
        >
          <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
          <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
          <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
        </button>
        <div className={`nav-links ${menuOpen ? "nav-open" : ""}`}>
          <Link to="/teacher" className={isActive("/teacher") ? "nav-active" : ""} onClick={handleNavClick}>
            Übersicht
          </Link>
          <Link to="/teacher/tasks" className={isActive("/teacher/tasks") ? "nav-active" : ""} onClick={handleNavClick}>
            Aufgaben
          </Link>
          <Link to="/teacher/exams" className={isActive("/teacher/exams") ? "nav-active" : ""} onClick={handleNavClick}>
            Klassenarbeiten
          </Link>
          <Link to="/teacher/duels" className={isActive("/teacher/duels") ? "nav-active" : ""} onClick={handleNavClick}>
            Lern-Duelle
          </Link>
          <Link to="/teacher/settings" className={isActive("/teacher/settings") ? "nav-active" : ""} onClick={handleNavClick}>
            Einstellungen
          </Link>
          <button onClick={handleLogout} className="btn-logout">
            Abmelden
          </button>
        </div>
      </nav>
      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}
      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
