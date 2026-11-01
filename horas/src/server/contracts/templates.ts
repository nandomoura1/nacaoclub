import type { TemplateField } from '@/domain/contracts';

/**
 * Modelos-base da Nação. São pontos de partida com cláusulas usuais — devem ser
 * revisados pelo jurídico/DP antes do primeiro uso (o texto é editável em Contratos → Modelos).
 */
export interface DefaultTemplate { name: string; category: string; description: string; body: string; fields: TemplateField[]; signerRoles: string[] }

const REVISAR = 'Modelo-base: revise com o jurídico antes do primeiro uso.';

const contratadoPj: TemplateField[] = [
  { key: 'contratado_nome', label: 'Nome / razão social do contratado', type: 'texto', required: true },
  { key: 'contratado_documento', label: 'CPF/CNPJ do contratado', type: 'cpf_cnpj', required: true },
  { key: 'contratado_endereco', label: 'Endereço do contratado', type: 'texto', required: true },
];

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Prestação de serviços — professor/instrutor (PJ/MEI)',
    category: 'PRESTADOR',
    description: `Aulas, personal, coordenação ou outro serviço prestado por pessoa jurídica/MEI, sem vínculo empregatício. ${REVISAR}`,
    signerRoles: ['CONTRATANTE', 'CONTRATADO'],
    fields: [
      ...contratadoPj,
      { key: 'servico', label: 'Serviço (ex.: aulas de Beach Tennis)', type: 'texto_longo', required: true },
      { key: 'carga', label: 'Dias, horários ou carga estimada', type: 'texto_longo', required: false, help: 'Ex.: terças e quintas, 18h às 21h' },
      { key: 'valor', label: 'Valor da remuneração', type: 'moeda', required: true },
      { key: 'forma_remuneracao', label: 'Base da remuneração (ex.: por hora-aula, mensal)', type: 'texto', required: true },
      { key: 'dia_pagamento', label: 'Dia do pagamento', type: 'numero', required: true },
      { key: 'inicio', label: 'Início', type: 'data', required: true },
      { key: 'prazo', label: 'Prazo (ex.: 12 meses / indeterminado)', type: 'texto', required: true },
      { key: 'aviso_previo_dias', label: 'Aviso prévio para encerrar (dias)', type: 'numero', required: true },
    ],
    body: `# Contrato de prestação de serviços

**CONTRATANTE:** {{empresa_razao_social}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, neste ato representada por {{empresa_representante}}.

**CONTRATADO(A):** {{contratado_nome}}, inscrito(a) no CPF/CNPJ sob o nº {{contratado_documento}}, com endereço em {{contratado_endereco}}.

As partes acima identificadas celebram o presente contrato de prestação de serviços, que se regerá pelas cláusulas a seguir.

## Cláusula 1ª — Objeto

O(A) CONTRATADO(A) prestará à CONTRATANTE os seguintes serviços: {{servico}}. Disponibilidade combinada: {{carga}}.

## Cláusula 2ª — Autonomia e ausência de vínculo

Os serviços serão prestados com autonomia técnica, sem subordinação, pessoalidade obrigatória ou exclusividade, não gerando vínculo empregatício entre as partes. O(A) CONTRATADO(A) é responsável pelos tributos e encargos de sua atividade.

## Cláusula 3ª — Remuneração

Pelos serviços, a CONTRATANTE pagará ao(à) CONTRATADO(A) {{valor}}, {{forma_remuneracao}}, até o dia {{dia_pagamento}} do mês seguinte à prestação, mediante emissão de nota fiscal ou recibo, conforme o caso.

## Cláusula 4ª — Obrigações do(a) contratado(a)

- Prestar os serviços com zelo, pontualidade e segurança, seguindo as normas internas da Nação Club.
- Comunicar com antecedência ausências, para que a CONTRATANTE organize a cobertura.
- Manter sigilo sobre dados de alunos, colaboradores e da CONTRATANTE, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

## Cláusula 5ª — Obrigações da contratante

- Disponibilizar o espaço e os equipamentos necessários à prestação dos serviços.
- Efetuar os pagamentos nas datas combinadas.

## Cláusula 6ª — Uso de imagem

O(A) CONTRATADO(A) autoriza o uso de sua imagem e voz, captadas durante as atividades na Nação Club, em materiais institucionais e de divulgação da CONTRATANTE, sem custo, durante a vigência deste contrato.

## Cláusula 7ª — Prazo e encerramento

Este contrato vigora a partir de {{inicio}}, pelo prazo de {{prazo}}, e pode ser encerrado por qualquer das partes mediante aviso prévio por escrito de {{aviso_previo_dias}} dias, sem multa.

## Cláusula 8ª — Foro

Fica eleito o foro de Brasília/DF para dirimir questões oriundas deste contrato.

As partes declaram que leram e concordam com este contrato e o assinam eletronicamente, reconhecendo a validade desse meio de assinatura.

{{cidade}}, {{data_hoje}}.`,
  },
  {
    name: 'Acordo individual de banco de horas (CLT)',
    category: 'COLABORADOR',
    description: `Compensação de jornada por banco de horas em acordo individual escrito (CLT, art. 59, § 5º — compensação em até 6 meses). ${REVISAR}`,
    signerRoles: ['EMPREGADOR', 'EMPREGADO'],
    fields: [
      { key: 'empregado_nome', label: 'Nome do(a) empregado(a)', type: 'texto', required: true },
      { key: 'empregado_cpf', label: 'CPF do(a) empregado(a)', type: 'cpf_cnpj', required: true },
      { key: 'cargo', label: 'Cargo', type: 'texto', required: true },
      { key: 'setor', label: 'Setor', type: 'texto', required: true },
      { key: 'inicio', label: 'Início do acordo', type: 'data', required: true },
    ],
    body: `# Acordo individual de compensação de jornada (banco de horas)

**EMPREGADORA:** {{empresa_razao_social}}, CNPJ nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}.

**EMPREGADO(A):** {{empregado_nome}}, CPF nº {{empregado_cpf}}, ocupante do cargo de {{cargo}}, no setor {{setor}}.

As partes firmam o presente acordo individual de compensação de jornada, nos termos do art. 59, § 5º, da Consolidação das Leis do Trabalho.

## Cláusula 1ª — Banco de horas

As horas trabalhadas além da jornada contratual poderão ser compensadas com folgas ou redução de jornada, dispensado o pagamento como horas extras, desde que a compensação ocorra no prazo máximo de 6 (seis) meses.

## Cláusula 2ª — Limites

A jornada diária não excederá 10 (dez) horas, respeitados os intervalos legais e o descanso mínimo de 11 (onze) horas entre jornadas.

## Cláusula 3ª — Controle

O saldo do banco de horas será controlado pela EMPREGADORA e ficará disponível para consulta do(a) EMPREGADO(A). As folgas compensatórias serão combinadas entre as partes, considerando a escala do setor.

## Cláusula 4ª — Saldo não compensado

As horas não compensadas no prazo do acordo, ou existentes na rescisão do contrato de trabalho, serão pagas como horas extras, com o adicional legal ou convencional.

## Cláusula 5ª — Vigência

Este acordo vigora a partir de {{inicio}}, por prazo indeterminado, podendo ser encerrado por qualquer das partes mediante comunicação por escrito, com apuração e acerto do saldo existente.

As partes declaram que leram e concordam com este acordo e o assinam eletronicamente.

{{cidade}}, {{data_hoje}}.`,
  },
  {
    name: 'Termo de compromisso de estágio',
    category: 'COLABORADOR',
    description: `Estágio (Lei nº 11.788/2008), com a instituição de ensino como parte. ${REVISAR}`,
    signerRoles: ['CONTRATANTE', 'ESTAGIARIO', 'INSTITUICAO_ENSINO'],
    fields: [
      { key: 'estagiario_nome', label: 'Nome do(a) estagiário(a)', type: 'texto', required: true },
      { key: 'estagiario_cpf', label: 'CPF do(a) estagiário(a)', type: 'cpf_cnpj', required: true },
      { key: 'curso', label: 'Curso', type: 'texto', required: true },
      { key: 'instituicao', label: 'Instituição de ensino', type: 'texto', required: true },
      { key: 'instituicao_cnpj', label: 'CNPJ da instituição', type: 'cpf_cnpj', required: true },
      { key: 'supervisor', label: 'Supervisor(a) na Nação', type: 'texto', required: true },
      { key: 'atividades', label: 'Atividades do estágio', type: 'texto_longo', required: true },
      { key: 'jornada', label: 'Jornada (máx. 6h/dia e 30h/semana)', type: 'texto', required: true },
      { key: 'bolsa', label: 'Bolsa mensal', type: 'moeda', required: true },
      { key: 'auxilio_transporte', label: 'Auxílio-transporte mensal', type: 'moeda', required: true },
      { key: 'seguro', label: 'Seguradora e apólice do seguro de acidentes', type: 'texto', required: true },
      { key: 'inicio', label: 'Início', type: 'data', required: true },
      { key: 'fim', label: 'Término', type: 'data', required: true },
    ],
    body: `# Termo de compromisso de estágio

**CONCEDENTE:** {{empresa_razao_social}}, CNPJ nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}.

**ESTAGIÁRIO(A):** {{estagiario_nome}}, CPF nº {{estagiario_cpf}}, aluno(a) do curso de {{curso}}.

**INSTITUIÇÃO DE ENSINO:** {{instituicao}}, CNPJ nº {{instituicao_cnpj}}.

As partes celebram este Termo de Compromisso de Estágio, nos termos da Lei nº 11.788/2008, que não gera vínculo empregatício.

## Cláusula 1ª — Atividades

O estágio compreenderá as seguintes atividades, compatíveis com o curso: {{atividades}}. A supervisão ficará a cargo de {{supervisor}}.

## Cláusula 2ª — Jornada

A jornada será de {{jornada}}, compatível com as atividades escolares, respeitado o limite legal de 6 horas diárias e 30 horas semanais.

## Cláusula 3ª — Bolsa e benefícios

A CONCEDENTE pagará ao(à) ESTAGIÁRIO(A) bolsa mensal de {{bolsa}} e auxílio-transporte de {{auxilio_transporte}}. O(A) ESTAGIÁRIO(A) terá direito a recesso de 30 dias a cada 12 meses de estágio, proporcional ao período estagiado.

## Cláusula 4ª — Seguro

O(A) ESTAGIÁRIO(A) está coberto(a) por seguro contra acidentes pessoais: {{seguro}}.

## Cláusula 5ª — Vigência

O estágio vigora de {{inicio}} a {{fim}}, podendo ser encerrado a qualquer tempo por qualquer das partes, mediante comunicação por escrito. A duração total não excederá 2 (dois) anos na mesma concedente, salvo pessoa com deficiência.

## Cláusula 6ª — Obrigações

O(A) ESTAGIÁRIO(A) compromete-se a cumprir as normas internas da CONCEDENTE e a manter sigilo sobre dados de alunos e da empresa. A INSTITUIÇÃO DE ENSINO acompanhará o estágio e avaliará os relatórios de atividades.

As partes declaram que leram e concordam com este termo e o assinam eletronicamente.

{{cidade}}, {{data_hoje}}.`,
  },
  {
    name: 'Prestação de serviços / fornecimento (fornecedor ou parceiro)',
    category: 'FORNECEDOR',
    description: `Serviço ou fornecimento contratado pela Nação (manutenção, eventos, consultoria, materiais). ${REVISAR}`,
    signerRoles: ['CONTRATANTE', 'CONTRATADO'],
    fields: [
      ...contratadoPj,
      { key: 'objeto', label: 'Objeto (o que será fornecido/realizado)', type: 'texto_longo', required: true },
      { key: 'prazo_entrega', label: 'Prazo de execução/entrega', type: 'texto', required: true },
      { key: 'valor', label: 'Valor total', type: 'moeda', required: true },
      { key: 'condicoes_pagamento', label: 'Condições de pagamento', type: 'texto_longo', required: true, help: 'Ex.: 50% na assinatura e 50% na entrega' },
      { key: 'garantia', label: 'Garantia', type: 'texto', required: false },
    ],
    body: `# Contrato de prestação de serviços e fornecimento

**CONTRATANTE:** {{empresa_razao_social}}, CNPJ nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, neste ato representada por {{empresa_representante}}.

**CONTRATADA:** {{contratado_nome}}, CPF/CNPJ nº {{contratado_documento}}, com endereço em {{contratado_endereco}}.

## Cláusula 1ª — Objeto

A CONTRATADA se obriga a: {{objeto}}.

## Cláusula 2ª — Prazo

O objeto será executado/entregue no prazo de {{prazo_entrega}}, contado da assinatura deste contrato, salvo outro ajuste por escrito.

## Cláusula 3ª — Preço e pagamento

O valor total é de {{valor}}, pago nas seguintes condições: {{condicoes_pagamento}}. Os pagamentos dependem da apresentação de nota fiscal.

## Cláusula 4ª — Responsabilidades

A CONTRATADA responde pela qualidade dos serviços e materiais, pelo cumprimento das normas de segurança dentro da Nação Club e pelos encargos trabalhistas, previdenciários e fiscais de sua equipe, que não terá vínculo com a CONTRATANTE. Garantia: {{garantia}}.

## Cláusula 5ª — Inadimplemento e rescisão

O descumprimento de qualquer cláusula permite à parte prejudicada rescindir o contrato mediante notificação por escrito, sem prejuízo de perdas e danos. Pelos serviços já executados e aceitos será devido o valor proporcional.

## Cláusula 6ª — Confidencialidade e dados

A CONTRATADA manterá sigilo sobre informações e dados pessoais a que tiver acesso, em conformidade com a Lei nº 13.709/2018 (LGPD).

## Cláusula 7ª — Foro

Fica eleito o foro de Brasília/DF.

As partes declaram que leram e concordam com este contrato e o assinam eletronicamente.

{{cidade}}, {{data_hoje}}.`,
  },
  {
    name: 'Cessão de espaço publicitário (marketing/patrocínio)',
    category: 'ESPACO_MARKETING',
    description: `Placa, banner, ativação ou outro espaço de divulgação da marca do parceiro nas dependências da Nação. ${REVISAR}`,
    signerRoles: ['CEDENTE', 'CESSIONARIO'],
    fields: [
      { key: 'parceiro_nome', label: 'Nome / razão social do parceiro', type: 'texto', required: true },
      { key: 'parceiro_documento', label: 'CPF/CNPJ do parceiro', type: 'cpf_cnpj', required: true },
      { key: 'parceiro_endereco', label: 'Endereço do parceiro', type: 'texto', required: true },
      { key: 'espaco', label: 'Espaço cedido (local, tamanho, formato)', type: 'texto_longo', required: true, help: 'Ex.: placa 3x1m na quadra de areia 2' },
      { key: 'contrapartidas', label: 'Contrapartidas extras (posts, ativações, ingressos)', type: 'texto_longo', required: false },
      { key: 'valor', label: 'Valor mensal (ou total)', type: 'moeda', required: true },
      { key: 'forma_pagamento', label: 'Forma e datas de pagamento', type: 'texto', required: true },
      { key: 'inicio', label: 'Início', type: 'data', required: true },
      { key: 'fim', label: 'Término', type: 'data', required: true },
    ],
    body: `# Contrato de cessão de espaço publicitário

**CEDENTE:** {{empresa_razao_social}}, CNPJ nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, neste ato representada por {{empresa_representante}}.

**CESSIONÁRIO(A):** {{parceiro_nome}}, CPF/CNPJ nº {{parceiro_documento}}, com endereço em {{parceiro_endereco}}.

## Cláusula 1ª — Objeto

A CEDENTE cede ao(à) CESSIONÁRIO(A), para divulgação de sua marca, o seguinte espaço nas dependências da Nação Club: {{espaco}}. Contrapartidas adicionais: {{contrapartidas}}.

## Cláusula 2ª — Material e aprovação

A arte e o material de divulgação serão fornecidos pelo(a) CESSIONÁRIO(A) e aprovados previamente pela CEDENTE, que poderá recusar conteúdo contrário à lei, à imagem da Nação Club ou ao seu manual de marca. Produção, instalação e manutenção do material correm por conta do(a) CESSIONÁRIO(A), salvo outro ajuste por escrito.

## Cláusula 3ª — Valor e pagamento

Pela cessão, o(a) CESSIONÁRIO(A) pagará {{valor}}, da seguinte forma: {{forma_pagamento}}. O atraso sujeita o(a) CESSIONÁRIO(A) a multa de 2% e juros de 1% ao mês, e pode suspender a exposição.

## Cláusula 4ª — Vigência

Este contrato vigora de {{inicio}} a {{fim}}. Ao final, o material será retirado em até 10 dias; após esse prazo, a CEDENTE poderá removê-lo.

## Cláusula 5ª — Responsabilidades

O(A) CESSIONÁRIO(A) responde pelo conteúdo divulgado e pelos direitos de uso de marcas e imagens do material. A CEDENTE não garante número mínimo de visualizações ou resultados comerciais.

## Cláusula 6ª — Rescisão

O descumprimento de qualquer cláusula permite à parte prejudicada rescindir o contrato mediante notificação por escrito, sem prejuízo dos valores devidos até a data.

## Cláusula 7ª — Foro

Fica eleito o foro de Brasília/DF.

As partes declaram que leram e concordam com este contrato e o assinam eletronicamente.

{{cidade}}, {{data_hoje}}.`,
  },
];
