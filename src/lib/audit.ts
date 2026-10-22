import { headers } from "next/headers";
import { prisma, type Transaction, Prisma } from "./prisma";
import { journal } from "./journal";
import { ulid } from "./ulid";

export type EvenementAudit = {
  action: string;
  login?: string | null;
  codeRole?: string | null;
  entite?: string;
  cleEntite?: string;
  avant?: unknown;
  apres?: unknown;
  detail?: string;
  succes?: boolean;
};

async function origineRequete() {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { adresseIp: ip?.slice(0, 45) ?? null, userAgent: h.get("user-agent")?.slice(0, 255) ?? null };
  } catch {
    // Appel hors requête HTTP (script, tâche planifiée).
    return { adresseIp: null, userAgent: null };
  }
}

const json = (v: unknown) => (v === undefined ? Prisma.DbNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/**
 * Trace un événement dans le journal d'audit en base ET dans le fichier de log.
 * Passer `tx` pour que l'audit soit écrit dans la même transaction que la modification.
 */
export async function auditer(e: EvenementAudit, tx?: Transaction) {
  const origine = await origineRequete();
  const ligne = {
    reference: ulid(),
    login: e.login ?? null,
    codeRole: e.codeRole ?? null,
    action: e.action,
    entite: e.entite ?? null,
    cleEntite: e.cleEntite ?? null,
    avant: json(e.avant),
    apres: json(e.apres),
    detail: e.detail ?? null,
    succes: e.succes ?? true,
    ...origine,
  };
  const niveau = ligne.succes ? "info" : "warn";
  journal[niveau](`AUDIT ${e.action}`, {
    reference: ligne.reference,
    login: ligne.login,
    role: ligne.codeRole,
    entite: ligne.entite,
    cle: ligne.cleEntite,
    detail: ligne.detail,
    avant: e.avant,
    apres: e.apres,
    ip: ligne.adresseIp,
  });
  try {
    await (tx ?? prisma).journalAudit.create({ data: ligne });
  } catch (err) {
    journal.error("Écriture de l'audit en base impossible", { erreur: err, reference: ligne.reference });
    if (tx) throw err;
  }
}
