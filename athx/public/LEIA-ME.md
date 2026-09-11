# Arquivos da marca

## logo-nacao-club.svg

Salve aqui o **SVG oficial** da logomarca da Nação Club, com este nome exato:

```
public/logo-nacao-club.svg
```

O componente `BrandLogo` detecta o arquivo sozinho e passa a usá-lo em todas
as telas — cabeçalho, hero, telão, rodapé e página do QR Code. **Nenhuma
linha de código precisa mudar.**

Enquanto o arquivo não existir, o sistema exibe uma assinatura tipográfica
(NAÇÃO / filete / C L U B), que respeita a construção e a paleta do manual.
A logomarca oficial **não é redesenhada nem aproximada** em nenhum ponto do
código — conforme o item 39 da especificação.

### Recomendações para o arquivo

- SVG com fundo transparente
- versão em **branco/monocromática clara**, porque o fundo da aplicação é o
  navy `#022B57` do manual
- altura de referência: 64 px (o SVG escala sozinho)
