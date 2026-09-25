/** Planilha reduzida ao essencial: texto de cada célula e se ela é continuação de uma mesclagem. */
export interface GridCell {
  text: string;
  /** Célula "escrava" de uma mesclagem (não é a primeira do bloco mesclado). */
  slave: boolean;
}
export type Grid = GridCell[][];

export type ImportLayout = 'SALA' | 'QUADRA' | 'PLANTAO';

export type PersonRole = 'TITULAR' | 'AUXILIAR' | 'ESTAGIARIO';

/** Uma aula lida da planilha, ainda sem vínculo com o banco. */
export interface ImportRow {
  sheet: string;
  /** Endereço da célula de origem, para o admin conferir: "C5". */
  ref: string;
  weekday: number;
  startMin: number;
  /** Só quando a planilha diz (plantão "5h - 6h"); senão vem da modalidade. */
  durationMin: number | null;
  spaceHint: string | null;
  /** Texto principal: "Hyrox", "Master", "SÉRIE D", "Mobilidade Master". */
  activityText: string | null;
  /** Modalidade implícita pela sala/aba: "CROSSFIT 1" → CrossFit. */
  fallbackText: string | null;
  /** Turma fixa vinda do rótulo da linha: "Auxiliares", "Estagiários". */
  labelHint?: string | null;
  kind: 'AULA' | 'PLANTAO' | 'PERSONAL' | 'COORDENACAO';
  people: { raw: string; role: PersonRole }[];
}

export interface ParsedSheet {
  sheet: string;
  layout: ImportLayout | null;
  rows: ImportRow[];
  warnings: string[];
}
