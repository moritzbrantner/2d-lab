import "./styles.css";

import { labScenarios } from "./scenarios";

const list = document.querySelector<HTMLElement>("#scenario-list");
if (!list) {
  throw new Error("missing scenario catalog");
}

for (const [index, scenario] of labScenarios.entries()) {
  const article = document.createElement("article");
  article.className = "scenario-card";

  const meta = document.createElement("p");
  meta.className = "scenario-card-index";
  meta.textContent = `Scenario ${index + 1} of ${labScenarios.length}`;

  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = `${import.meta.env.BASE_URL}${scenario.path}`;
  link.textContent = scenario.title;
  title.append(link);

  const useCase = document.createElement("p");
  useCase.textContent = scenario.useCase;

  const question = document.createElement("p");
  question.className = "scenario-question";
  question.textContent = scenario.question;

  article.append(meta, title, useCase, question);
  list.append(article);
}
