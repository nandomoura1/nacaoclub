# Arquivos da marca

## A logomarca

Salve o arquivo oficial aqui, em `athx/public/`, com **um** destes nomes:

| Prioridade | Arquivo | Quando usar |
|---|---|---|
| 1º | `logo-nacao-club-white.svg` | **recomendado** — versão branca/monocromática clara |
| 2º | `logo-nacao-club.svg` | versão colorida, se não houver a branca |
| 3º | `logo-nacao-club-white.png` | branca em raster |
| 4º | `logo-nacao-club.png` | colorida em raster |

O componente `BrandLogo` testa os quatro nesta ordem e usa o primeiro que
carregar. **Nenhuma linha de código precisa mudar** — é só soltar o arquivo e
dar deploy. Ele aparece no cabeçalho, no rodapé, no login, na tela de
manutenção e no telão.

### ⚠️ Por que a versão BRANCA importa

O fundo da aplicação é o **navy `#022B57`** do manual. A logomarca em azul
`#0169E9` sobre esse navy tem contraste baixíssimo — some. O próprio manual
prevê isso ao trazer a *"logomarca monocromática variando conforme paleta
sugerida"*.

Então: exporte a versão **branca**, fundo transparente, e salve como
`logo-nacao-club-white.svg`.

### Prefira SVG

O telão (`/display`) escala a logomarca até 1920 px ou mais. Em SVG ela fica
nítida em qualquer tamanho; em PNG serrilha. Se só houver PNG, exporte com
pelo menos **512 px de altura** e fundo transparente.

---

## Enquanto o arquivo não existir

O sistema exibe uma **assinatura tipográfica** — NAÇÃO / filete / C L U B —
que respeita a construção e a paleta do manual.

A logomarca oficial **não é redesenhada, traçada nem aproximada** em nenhum
ponto do código. Isso é deliberado: uma reprodução "parecida" de um escudo de
marca é pior do que um placeholder honesto.
