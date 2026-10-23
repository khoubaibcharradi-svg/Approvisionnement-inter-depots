import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { auditer } from "@/lib/audit";
import { ROLES } from "@/lib/constantes";
import { activite, etatBase, etatJournaux, etatSauvegardes, etatServeur } from "@/lib/it";
import { BoutonDeconnexion } from "./bouton";

export const dynamic = "force-dynamic";

type Niveau = "ok" | "attention" | "alerte";
const COULEURS: Record<Niveau, string> = {
  ok: "border-slate-200 bg-white",
  attention: "border-amber-300 bg-amber-50",
  alerte: "border-red-300 bg-red-50",
};
const PASTILLES: Record<Niveau, string> = { ok: "bg-emerald-500", attention: "bg-amber-500", alerte: "bg-red-600" };

const octets = (o: number) =>
  o >= 1_073_741_824 ? `${(o / 1_073_741_824).toFixed(1)} Go` : o >= 1_048_576 ? `${(o / 1_048_576).toFixed(1)} Mo` : `${Math.ceil(o / 1024)} Ko`;
const duree = (s: number) => {
  const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return j ? `${j} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};
const pct = (x: number) => `${Math.round(x * 100)} %`;

function Indicateur({ titre, valeur, detail, niveau = "ok" }: { titre: string; valeur: string; detail?: string; niveau?: Niveau }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-4 ${COULEURS[niveau]}`}>
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <span className={`h-2 w-2 rounded-full ${PASTILLES[niveau]}`} aria-hidden="true" />
        {titre}
      </p>
      <p className="text-2xl font-semibold text-slate-900">{valeur}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">{titre}</h2>
      {children}
    </section>
  );
}

export default async function PageIT() {
  const u = await exigerUtilisateur([ROLES.ADMIN_FULL]);
  await auditer({ action: "CONSULTATION_TABLEAU_IT", login: u.login, codeRole: u.role, entite: "Exploitation" });
  const serveur = etatServeur();
  const [base, act] = await Promise.all([etatBase(), activite()]);
  const sauv = etatSauvegardes();
  const logs = etatJournaux();

  const disqueLibre = serveur.disque.libre / serveur.disque.total;
  const memoireUtilisee = 1 - serveur.memoire.libre / serveur.memoire.totale;
  const charge = serveur.charge[0] / serveur.processeurs;
  const ageSauvegarde = sauv.derniere?.ageHeures ?? Infinity;
  const alertes = [
    disqueLibre < 0.15 && "Espace disque faible",
    ageSauvegarde > 26 && "Aucune sauvegarde depuis plus de 26 h",
    base.migrations.enEchec > 0 && "Migration de base en échec",
    logs.erreursAujourdhui > 0 && `${logs.erreursAujourdhui} erreur(s) applicative(s) aujourd'hui`,
    act.echecs >= 20 && `${act.echecs} échecs de connexion en 24 h`,
    act.verrouilles.length > 0 && `${act.verrouilles.length} compte(s) verrouillé(s)`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Tableau de bord IT</h1>
          <p className="note">Serveur {serveur.hote} · mis à jour à {new Date().toLocaleTimeString("fr-FR")} · <Link href="/admin/it" className="underline">actualiser</Link></p>
        </div>
      </div>

      <div className={alertes.length ? "alerte-erreur" : "alerte-ok"}>
        {alertes.length ? <><b>À surveiller :</b> {alertes.join(" · ")}</> : "Tout est normal : serveur, base, sauvegardes et journaux."}
      </div>

      <Section titre="Serveur">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicateur titre="Disque" valeur={`${pct(disqueLibre)} libre`} detail={`${octets(serveur.disque.libre)} libres sur ${octets(serveur.disque.total)}`} niveau={disqueLibre < 0.15 ? "alerte" : disqueLibre < 0.3 ? "attention" : "ok"} />
          <Indicateur titre="Mémoire" valeur={`${pct(memoireUtilisee)} utilisée`} detail={`${octets(serveur.memoire.totale - serveur.memoire.libre)} / ${octets(serveur.memoire.totale)} · application ${octets(serveur.memoireApplication)}`} niveau={memoireUtilisee > 0.9 ? "alerte" : memoireUtilisee > 0.75 ? "attention" : "ok"} />
          <Indicateur titre="Charge processeur" valeur={serveur.charge[0].toFixed(2)} detail={`${serveur.processeurs} cœur(s) · 5 min ${serveur.charge[1].toFixed(2)} · 15 min ${serveur.charge[2].toFixed(2)}`} niveau={charge > 1 ? "alerte" : charge > 0.7 ? "attention" : "ok"} />
          <Indicateur titre="Disponibilité" valeur={duree(serveur.demarrageApplication)} detail={`Application démarrée · serveur allumé depuis ${duree(serveur.demarrageServeur)}`} />
        </div>
        <p className="note">{serveur.systeme} · Node {serveur.node} · Next.js {serveur.next} · {serveur.environnement} · fuseau {serveur.fuseau}</p>
      </Section>

      <Section titre="Base de données">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicateur titre="Taille" valeur={octets(base.octets)} detail={`MySQL ${base.version}`} />
          <Indicateur titre="Connexions ouvertes" valeur={String(base.connexions)} detail={`Base démarrée depuis ${duree(base.demarrage)}`} />
          <Indicateur titre="Migrations" valeur={String(base.migrations.nombre)} detail={base.migrations.derniere ? `Dernière : ${base.migrations.derniere.nom}` : "—"} niveau={base.migrations.enEchec ? "alerte" : "ok"} />
          <Indicateur titre="Pièces jointes" valeur={octets(act.pieces.octets)} detail={`${act.pieces.fichiers} fichier(s) sur le disque`} />
        </div>
        <div className="carte overflow-x-auto p-0">
          <table className="tableau">
            <thead><tr><th>Table (les plus volumineuses)</th><th className="text-right">Lignes (estimation)</th><th className="text-right">Taille</th></tr></thead>
            <tbody>{base.tables.map((t) => <tr key={t.nom}><td className="font-mono text-xs">{t.nom}</td><td className="text-right tabular-nums">{t.lignes.toLocaleString("fr-FR")}</td><td className="text-right tabular-nums">{octets(t.octets)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section titre="Sauvegardes">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicateur titre="Dernière sauvegarde" valeur={sauv.derniere ? `il y a ${duree(ageSauvegarde * 3600)}` : "aucune"} detail={sauv.derniere ? `${sauv.derniere.fichier} · ${octets(sauv.derniere.octets)}` : undefined} niveau={ageSauvegarde > 26 ? "alerte" : "ok"} />
          <Indicateur titre="Sauvegardes conservées" valeur={String(sauv.nombre)} detail={`${octets(sauv.octets)} · rétention ${sauv.retentionJours} jours`} />
          <Indicateur titre="Planification" valeur={sauv.heure} detail={sauv.automatique ? "Chaque jour, par l'application" : "Planifiée par le système (cron)"} />
          <Indicateur titre="Copie hors serveur" valeur="à mettre en place" detail="Les sauvegardes restent sur le VPS" niveau="attention" />
        </div>
        <Link href="/admin/sauvegardes" className="btn-secondaire self-start">Gérer les sauvegardes et télécharger les journaux</Link>
      </Section>

      <Section titre="Journaux de l'application">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicateur titre="Erreurs aujourd'hui" valeur={String(logs.erreursAujourdhui)} detail={`Hier : ${logs.erreursHier}`} niveau={logs.erreursAujourdhui > 10 ? "alerte" : logs.erreursAujourdhui > 0 ? "attention" : "ok"} />
          <Indicateur titre="Fichiers de journal" valeur={String(logs.fichiers)} detail={`${octets(logs.octets)} · rétention ${logs.retentionJours} jours`} />
        </div>
        {logs.dernieresErreurs.length > 0 && (
          <div className="carte overflow-x-auto p-0">
            <table className="tableau">
              <thead><tr><th>Date</th><th>Dernières erreurs</th></tr></thead>
              <tbody>{logs.dernieresErreurs.map((e, i) => <tr key={i}><td className="whitespace-nowrap text-xs">{e.date ? new Date(e.date).toLocaleString("fr-FR") : "—"}</td><td className="max-w-0 text-xs"><p className="line-clamp-2 break-all" title={e.message}>{e.message}</p></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section titre="Sécurité et activité (24 dernières heures)">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicateur titre="Connexions réussies" valeur={String(act.connexions)} detail={`${act.connectes24h} utilisateur(s) connecté(s) sur ${act.utilisateursActifs} actifs`} />
          <Indicateur titre="Échecs de connexion" valeur={String(act.echecs)} detail={`${act.verrouillages} verrouillage(s)`} niveau={act.echecs >= 20 ? "alerte" : act.echecs >= 5 ? "attention" : "ok"} />
          <Indicateur titre="Accès refusés" valeur={String(act.accesRefuses)} detail="Pages ouvertes hors de son profil" niveau={act.accesRefuses >= 10 ? "attention" : "ok"} />
          <Indicateur titre="Mots de passe à changer" valeur={String(act.mdpAChanger)} detail="Comptes avec mot de passe provisoire" niveau={act.mdpAChanger ? "attention" : "ok"} />
        </div>
        {(act.verrouilles.length > 0 || act.ipsEchecs.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {act.verrouilles.length > 0 && (
              <div className="carte text-sm">
                <p className="mb-2 font-semibold">Comptes verrouillés</p>
                <ul className="flex flex-col gap-1">{act.verrouilles.map((v) => <li key={v.login}><span className="font-mono">{v.login}</span> jusqu&apos;à {v.verrouilleJusqua!.toLocaleTimeString("fr-FR")}</li>)}</ul>
              </div>
            )}
            {act.ipsEchecs.length > 0 && (
              <div className="carte text-sm">
                <p className="mb-2 font-semibold">Adresses IP avec le plus d&apos;échecs</p>
                <ul className="flex flex-col gap-1">{act.ipsEchecs.map((v) => <li key={v.ip}><span className="font-mono">{v.ip}</span> : {v.nombre} échec(s)</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p className="note">{act.evenements} événement(s) dans le journal d&apos;audit · <Link href="/audit" className="underline">ouvrir le journal d&apos;audit</Link></p>
      </Section>

      <Section titre="Actions">
        <div className="carte flex flex-col gap-3">
          <p className="note">Fermer toutes les sessions oblige chaque utilisateur à se reconnecter (après un incident, un mot de passe divulgué ou une mise à jour sensible).</p>
          <BoutonDeconnexion />
        </div>
      </Section>
    </div>
  );
}
