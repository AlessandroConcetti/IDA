import { useState } from "react";

export type HomeSetup = "unknown" | "home-assistant" | "voice-apps";

export function homeConnectionAdvice(setup: HomeSetup): { title: string; next: string } {
  if (setup === "home-assistant")
    return {
      title: "Vérifier une première lampe",
      next: "Vérifiez qu’elle apparaît déjà dans Home Assistant. Nous pourrons ensuite préparer un accès limité à son état, après validation de la connexion.",
    };
  if (setup === "voice-apps")
    return {
      title: "Identifier la marque et le modèle",
      next: "Relevez-les dans l’application du fabricant ou sur la fiche de l’appareil. Sa présence dans Alexa ou Google Home ne suffit pas à confirmer sa compatibilité avec IDA.",
    };
  return {
    title: "Partir de votre installation",
    next: "Choisissez une lampe et identifiez sa marque, son modèle et l’application qui la gère. N’installez pas de nouveau hub avant la vérification de compatibilité.",
  };
}

export function HomeConnections() {
  const [setup, setSetup] = useState<HomeSetup>("unknown");
  const advice = homeConnectionAdvice(setup);
  return (
    <section className="home-connections home-daily-card" aria-labelledby="home-connections-title">
      <header>
        <span className="home-card-symbol" aria-hidden="true">
          ⌂
        </span>
        <h2 id="home-connections-title">Domotique</h2>
        <span className="home-card-note">Non connectée</span>
      </header>
      <p>Préparons la connexion de vos appareils, en commençant par la lecture de l’état d’une lampe.</p>
      <label htmlFor="home-connection-setup">Votre installation actuelle</label>
      <select
        id="home-connection-setup"
        value={setup}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "unknown" || value === "home-assistant" || value === "voice-apps") setSetup(value);
        }}
      >
        <option value="unknown">Je ne sais pas encore</option>
        <option value="home-assistant">J’ai déjà Home Assistant</option>
        <option value="voice-apps">Alexa / Google Home, sans Home Assistant</option>
      </select>
      <div className="home-connection-advice" role="status" aria-live="polite" aria-atomic="true">
        <h3>{advice.title}</h3>
        <p>{advice.next}</p>
      </div>
      <details>
        <summary>Comment Alexa et Google Home pourront s’intégrer</summary>
        <ul>
          <li>
            <strong>Alexa.</strong> L’intégration officielle permet d’exposer les appareils d’un service à Alexa ; elle
            n’importe pas automatiquement ceux de vos autres services.{" "}
            <a
              href="https://developer.amazon.com/docs/alexaplus/smarthome/connect-your-cloud-with-addons.html"
              target="_blank"
              rel="noreferrer"
            >
              Documentation Amazon
            </a>
            .
          </li>
          <li>
            <strong>Google Home.</strong> Ses API pour applications proposent des SDK Android et iOS. Cette piste native
            reste à préparer ; elle ne connecte pas le navigateur IDA aujourd’hui.{" "}
            <a href="https://developers.home.google.com/apis" target="_blank" rel="noreferrer">
              Documentation Google
            </a>
            .
          </li>
          <li>
            <strong>Home Assistant.</strong> Une passerelle possible pour le Core d’IDA, si vos appareils y sont
            compatibles et déjà accessibles. Ce n’est pas un import universel d’Alexa ou Google.{" "}
            <a href="https://developers.home-assistant.io/docs/api/rest/" target="_blank" rel="noreferrer">
              Documentation Home Assistant
            </a>
            .
          </li>
        </ul>
      </details>
      <p className="home-connection-safety">
        Ce choix guide la préparation uniquement : aucun compte associé, recherche réseau ou appareil activé. Aucun mot
        de passe ni token à saisir ici.
      </p>
    </section>
  );
}
