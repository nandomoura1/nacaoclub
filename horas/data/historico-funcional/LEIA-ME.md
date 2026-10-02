# Histórico de programação — Funcional

Gerado por `scripts/import-funcional-hyrox.py` a partir do documento de programação
Funcional + Hyrox (ago/2024 a ago/2026). Mesmo formato de `data/historico-crossfit`:

    ## AAAA-MM-DD
    #aula:48            duração planejada da aula (quando o documento informa)
    WU 15 | 2 x | 5 meio sugado; 15 perdigueiro D; ...
    WOD 19 | 5 x 3' on 1' off | 6 Double Db Clean; 6 box jump; ...

Regras da segmentação:

- dia sem rótulo = Funcional;
- "Hyrox", "HYROX" ou "Corrida Fitness" abre uma aula de Hyrox (vai para `data/historico-hyrox`);
- "Funcional / Hyrox" = aula mista, entra nas duas modalidades com a tag `#misto`;
- o documento não traz o ano: ele é inferido pela sequência e conferido pelo dia da
  semana. Datas com erro de digitação (ex.: "Sábado 17/10" entre 12/08 e 19/08) viram a
  próxima data com aquele dia da semana.

Conferência das datas: os 48 dias com data deduzida (41 sem data no documento e 7 com
data que não batia com o dia da semana) foram conferidos pela Nação em 02/10/2026 —
todas as datas usadas estão corretas.

Depois de editar os arquivos, rode `node scripts/embed-history.mjs`.

Planilha "Hyrox" (Google Sheets, importada em 02/10/2026, à mão): Hyrox 21–26/09 e
28/09–03/10 (abas 1º e 2º Semana) e Funcional 28/09–02/10 (aba "Funcional", sem datas
na planilha — semana de 28/09; a segunda "Quarta-Feira" virou quinta 01/10). A
"Quarta 24/9" da aba 1 virou 23/09 (24/09 é quinta).
