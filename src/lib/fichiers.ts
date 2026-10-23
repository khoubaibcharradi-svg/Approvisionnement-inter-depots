/**
 * Contrôle du contenu réel d'un fichier envoyé (signature binaire), en plus de son extension :
 * un fichier renommé (ex. un exécutable ou une page HTML en « .pdf ») est refusé.
 */

const commencePar = (b: Uint8Array, octets: number[]) => octets.every((o, i) => b[i] === o);

export function contenuConforme(extension: string, b: Uint8Array) {
  switch (extension) {
    case "pdf":
      return commencePar(b, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "png":
      return commencePar(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return commencePar(b, [0xff, 0xd8, 0xff]);
    case "xlsx":
      return commencePar(b, [0x50, 0x4b, 0x03, 0x04]); // archive ZIP (format Office Open XML)
    case "xls":
      return commencePar(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // format binaire Office
    case "csv": {
      // Texte uniquement : aucun octet nul, et pas de balisage HTML ou de script en tête.
      const debut = b.subarray(0, 65536);
      if (debut.includes(0)) return false;
      const texte = new TextDecoder("latin1").decode(debut.subarray(0, 512)).trimStart().toLowerCase();
      return !/^(<!doctype|<html|<script|<\?xml|<svg)/.test(texte);
    }
    default:
      return false;
  }
}
