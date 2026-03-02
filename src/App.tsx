import MapView from "./MapView";
import QuizPage from "./QuizPage";
import { resolveAppPage } from "./lib/appRoute";

export default function App() {
  const basePath = import.meta.env.BASE_URL;
  if (resolveAppPage(window.location.pathname, basePath) === "quiz") {
    return <QuizPage />;
  }
  return <MapView />;
}
