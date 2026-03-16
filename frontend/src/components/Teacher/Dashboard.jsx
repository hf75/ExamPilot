import { Link, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../../api/client";

export default function Dashboard() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h1>📝 ExamPilot</h1>
        </div>
        <div className="nav-links">
          <Link to="/teacher">Übersicht</Link>
          <Link to="/teacher/tasks">Aufgaben</Link>
          <Link to="/teacher/exams">Klassenarbeiten</Link>
          <Link to="/teacher/duels">Lern-Duelle</Link>
          <button onClick={handleLogout} className="btn-logout">
            Abmelden
          </button>
        </div>
      </nav>
      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
