import type { MailDraftPurpose } from "@ida/contracts";

/** Explicit local text suggestion, not an agent, send, booking or qualification result. */
export function proposeMusicMail(input: {
  purpose: MailDraftPurpose;
  projectName: string;
  presentation: string;
  trackTitle?: string;
  listeningUrl: string;
}) {
  const project = input.projectName.trim();
  const introduction = input.presentation.trim();
  const listening = input.listeningUrl.trim()
    ? `Lien d’écoute à vérifier avant tout envoi : ${input.listeningUrl.trim()}`
    : "";
  const subject =
    input.purpose === "LABEL_DEMO"
      ? `Proposition musicale — ${project}`
      : input.purpose === "PRIVATE_EVENT"
        ? `Prestations DJ privées — ${project}`
        : `Proposition de programmation DJ — ${project}`;
  const request =
    input.purpose === "LABEL_DEMO"
      ? `Je vous présente mon projet ${project}${input.trackTitle ? ` et le morceau « ${input.trackTitle} »` : ""}. À qui puis-je adresser une proposition musicale et quelles sont vos consignes pour les démos ?`
      : input.purpose === "PRIVATE_EVENT"
        ? `Je vous contacte sous le nom ${project} pour proposer des prestations DJ lors de mariages, baptêmes et anniversaires privés. Travaillez-vous avec des DJ indépendants et, si oui, à qui puis-je présenter mes services ?`
        : `Je vous présente mon projet ${project}. Acceptez-vous des propositions de programmation DJ pour votre établissement et quel est le bon interlocuteur ?`;
  return {
    subject,
    body: ["Bonjour,", request, introduction, listening, "Merci pour votre retour,", project]
      .filter(Boolean)
      .join("\n\n"),
  };
}
