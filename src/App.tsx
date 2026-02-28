import MapView from "./MapView";
import QuizPage from "./QuizPage";

export default function App() {
  const basePath = import.meta.env.BASE_URL;
  const pathname = window.location.pathname;
  const quizPath = `${basePath.replace(/\/$/, "")}/quiz`;
  if (pathname === quizPath || pathname === `${quizPath}/`) {
    return <QuizPage />;
  }
  return <MapView />;
}
