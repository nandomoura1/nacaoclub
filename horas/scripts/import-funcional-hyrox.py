#!/usr/bin/env python3
"""
Converte o documento de programação de Funcional + Hyrox (texto extraído do
.docx) para o formato do histórico (data/historico-*/AAAA-MM.txt):

    ## 2025-08-11
    WU 10 | Emom 9' | bike / row; perdigueiro
    WOD 28 | Amrap 14' #partner | 10 db snatch D; ...

Segmentação: dia sem rótulo = Funcional; "Hyrox"/"HYROX"/"Corrida fitness"
abre uma aula de Hyrox; "Funcional / Hyrox" = aula mista (vai para os dois,
com a tag #misto). O ano não aparece no documento: é inferido pela sequência
e conferido pelo dia da semana (datas com erro de digitação são corrigidas
para a próxima data com aquele dia da semana).

Uso: python3 scripts/import-funcional-hyrox.py <texto.txt> <log.txt>
"""
import datetime as dt
import re
import sys
from collections import defaultdict

SRC, LOG = sys.argv[1], sys.argv[2]
lines = [l.replace('’', "'").replace('‘', "'").replace('”', '"').replace('“', '"').replace('–', '-').replace('—', '-').rstrip() for l in open(SRC, encoding='utf8')]

WD = {'segunda': 0, 'terça': 1, 'terca': 1, 'quarta': 2, 'quinta': 3, 'sexta': 4, 'sábado': 5, 'sabado': 5, 'domingo': 6}
DAY = re.compile(r'^\*?\s*(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:[- ]feira)?\b\s*(\d{1,2})?\s*/?\s*(\d{1,2})?(.*)$', re.I)
LABEL = re.compile(r'^\*?\s*(funcional|hyrox|corrida fitness)\b(.*)$', re.I)
HEAD = [
    (re.compile(r'^(aquecimento|warm ?up)\b', re.I), 'WU'),
    (re.compile(r'^mobilidade\b', re.I), 'MOB'),
    (re.compile(r'^espec[ií]fico\b', re.I), 'ESP'),
    (re.compile(r'^(t[ée]cnica|educativos?)\b', re.I), 'TEC'),
    (re.compile(r'^(skill)\b', re.I), 'SKILL'),
    (re.compile(r'^(for[çc]a)\b', re.I), 'FOR'),
    (re.compile(r'^(wod|workout|treino)\b', re.I), 'WOD'),
    (re.compile(r'^core\b', re.I), 'ACC'),
    (re.compile(r'^(cardio|stamina|extra corrida)\b', re.I), 'CARDIO'),
    (re.compile(r'^explica[çc][ãa]o\b', re.I), 'EXP'),
]
FORMAT = re.compile(r'^(for time|amrap|emom|e\dmom|running clock|tabata|\d+\s*(x|rounds?|séries|series)\b|a cada|\d+\s*x\s*amrap|chipper|ladder|death by|every)', re.I)
MIN = re.compile(r"(\d+)\s*'")
SENSITIVE = re.compile(r'\bpix\b|r\$|day use|\b\d{2}\s?9\d{4}-?\d{4}\b|\b\d{10,11}\b|@\w+\.', re.I)

def clean(s):
    return re.sub(r'\s+', ' ', s.replace('*', '')).strip()

class Block:
    def __init__(self, kind, minutes):
        self.kind, self.minutes, self.title, self.items, self.tags = kind, minutes, [], [], set()

class Klass:
    def __init__(self, mod):
        self.mod, self.blocks, self.tags, self.minutes = mod, [], set(), None

days = []  # (date, [Klass])
log = []
cur_date = None
prev = None
klass = None
block = None

def new_class(mod):
    global klass, block
    klass = Klass(mod)
    days[-1][1].append(klass)
    block = None

def resolve_date(wd, d, m, raw, n):
    global prev
    if prev is None:
        return dt.date(2024, m, d)
    if d and m:
        for y in (prev.year, prev.year + 1):
            try:
                c = dt.date(y, m, d)
            except ValueError:
                continue
            if prev < c <= prev + dt.timedelta(days=70) and c.weekday() == wd:
                return c
    c = prev + dt.timedelta(days=1)
    while c.weekday() != wd:
        c += dt.timedelta(days=1)
    log.append(f'linha {n}: "{raw}" -> {c.isoformat()} (data inferida pelo dia da semana)')
    return c

for n, raw in enumerate(lines, 1):
    line = clean(raw)
    if not line or line == '---TABLE END---':
        continue
    md = DAY.match(line)
    if md and len(line) < 60:
        wd = WD[md.group(1).lower()]
        d = int(md.group(2)) if md.group(2) else None
        m = int(md.group(3)) if md.group(3) else None
        date = resolve_date(wd, d, m, line, n)
        if prev and date <= prev:
            log.append(f'linha {n}: "{line}" repete/volta a data {date}; ignorado como novo dia')
            continue
        prev = date
        days.append((date, []))
        new_class('funcional')
        mm = MIN.search(md.group(4) or '')
        if mm:
            klass.minutes = int(mm.group(1))
        if re.search(r'feriado', line, re.I):
            klass.tags.add('feriado')
        continue
    if not days:
        continue
    ml = LABEL.match(line)
    if ml and len(line) < 40:
        word = ml.group(1).lower()
        rest = ml.group(2).lower()
        mixed = ('hyrox' in rest and word == 'funcional') or ('funcional' in rest and word == 'hyrox')
        mod = 'misto' if mixed else ('funcional' if word == 'funcional' and 'hyrox' not in rest else 'hyrox')
        # Rótulo seguido de formato ("HYROX / Funcional" + "For time - cap 30'") é
        # o nome do WOD da aula corrente, não uma aula nova.
        nxt = next((clean(x) for x in lines[n:n + 3] if clean(x)), '')
        if klass.blocks and FORMAT.match(nxt):
            klass.mod = mod
            block = Block('WOD', None)
            klass.blocks.append(block)
        elif klass.blocks:
            new_class(mod)
        else:
            klass.mod = mod
        continue
    # Anúncios (aulão de feriado, Pix, day use) não são treino e podem ter telefone/nome: fora.
    if SENSITIVE.search(line):
        continue
    if line.startswith('#'):
        if re.search(r'longo', line, re.I):
            klass.tags.add('longo')
        continue
    head = next((k for r, k in HEAD if r.match(line)), None)
    if head and len(line) < 45:
        mm = MIN.search(line)
        block = Block(head, int(mm.group(1)) if mm else None)
        klass.blocks.append(block)
        rest = re.sub(r'^\S+\s*(\d+)?\s*[-:]?\s*', '', line)
        rest = re.sub(r"^-?\s*\d+\s*'", '', rest).strip(' -')
        if rest and FORMAT.match(rest):
            block.title.append(rest)
        continue
    if block is None:
        block = Block('WU', None)
        klass.blocks.append(block)
    if re.match(r'^(dupla|em dupla|trio)\b', line, re.I):
        target = block if block.kind == 'WOD' else None
        (target or block).tags.add('trio' if line.lower().startswith('trio') else 'partner')
        continue
    # Formato forte depois do específico/aquecimento sem cabeçalho "WOD" = começou o WOD.
    if FORMAT.match(line) and block.kind in ('ESP', 'EXP') and block.items and re.match(r'^(for time|amrap|emom|running clock|\d+\s*rounds?|\d+\s*x\s*\d+\'?\s*on)', line, re.I):
        block = Block('WOD', None)
        klass.blocks.append(block)
    if FORMAT.match(line) and len(line) < 60 and not (re.match(r'^\d+\s*x\s+(\d+\s+)?(?!amrap|emom|rounds?\b)[a-zà-ú]', line.lower()) and "'" not in line) or re.match(r'^(rest|descanso)\b', line, re.I):
        if block.kind == 'WOD' and not block.minutes:
            mm = re.search(r"cap\s*(\d+)|(\d+)\s*'", line, re.I)
            if mm and not line.lower().startswith('rest'):
                block.minutes = int(mm.group(1) or mm.group(2))
        (block.title if block.kind != 'WU' or not block.items else block.items).append(line)
        continue
    if re.match(r'^(then|bloco [a-z0-9]|[a-f]\s*-)', line, re.I) and len(line) < 12:
        continue
    block.items.append(line)

out = defaultdict(lambda: defaultdict(list))  # mod -> month -> lines
count = defaultdict(int)
for date, classes in days:
    for k in classes:
        if not k.blocks and 'feriado' not in k.tags:
            continue
        mods = ['funcional', 'hyrox'] if k.mod == 'misto' else [k.mod]
        for mod in mods:
            buf = out[mod][date.strftime('%Y-%m')]
            buf.append(f'## {date.isoformat()}')
            tags = sorted(k.tags | ({'misto'} if k.mod == 'misto' else set()))
            if k.minutes:
                tags.append(f'aula:{k.minutes}')
            if tags:
                buf.append(' '.join(f'#{t}' for t in tags))
            for b in k.blocks:
                if b.kind == 'EXP':
                    continue
                title = ' + '.join(b.title)
                if b.tags:
                    title = (title + ' ' + ' '.join(f'#{t}' for t in sorted(b.tags))).strip()
                items = '; '.join(i.replace('|', '/').replace(';', ',') for i in b.items)
                title = title.replace('|', '/').replace('#', '') if not b.tags else title.replace('|', '/')
                buf.append(f"{b.kind}{(' ' + str(b.minutes)) if b.minutes else ''} | {title} | {items}".rstrip(' |'))
            count[mod] += 1

import os
for mod, months in out.items():
    d = f'data/historico-{mod}'
    os.makedirs(d, exist_ok=True)
    for month, buf in months.items():
        with open(f'{d}/{month}.txt', 'w', encoding='utf8') as f:
            f.write(f'# {mod.capitalize()} {month} — importado do documento de programação (Funcional + Hyrox)\n\n')
            f.write('\n'.join(buf) + '\n')
with open(LOG, 'w', encoding='utf8') as f:
    f.write('\n'.join(log) + '\n')
print(dict(count), 'dias:', len(days), 'avisos:', len(log))
