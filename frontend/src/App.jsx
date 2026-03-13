import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isLoggedIn } from "./api/client";
import Login from "./components/shared/Login";
import Dashboard from "./components/Teacher/Dashboard";
import Overview from "./components/Teacher/Overview";
import TaskPool from "./components/Teacher/TaskPool";
import ExamBuilder from "./components/Teacher/ExamBuilder";
import LiveMonitor from "./components/Teacher/LiveMonitor";
import Results from "./components/Teacher/Results";
import StudentResult from "./components/Teacher/StudentResult";
import ExamPreview from "./components/Teacher/ExamPreview";
import JoinExam from "./components/Student/JoinExam";
import ExamView from "./components/Student/ExamView";
import ResultView from "./components/Student/ResultView";

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Student routes */}
        <Route path="/" element={<JoinExam />} />
        <Route path="/exam/:sessionId" element={<ExamView />} />
        <Route path="/results/:sessionId" element={<ResultView />} />

        {/* Teacher routes */}
        <Route path="/login" element={<Login />} />
        <Route
          path="/teacher/exams/:examId/preview"
          element={
            <ProtectedRoute>
              <ExamPreview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="tasks" element={<TaskPool />} />
          <Route path="exams" element={<ExamBuilder />} />
          <Route path="exams/:examId/monitor" element={<LiveMonitor />} />
          <Route path="exams/:examId/results" element={<Results />} />
          <Route path="exams/:examId/results/:sessionId" element={<StudentResult />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
